import { GEMINI_API_KEY } from './secrets.local.js';

// Event parser. Asks Gemini 3.5 Flash-Lite for structured event fields,
// then falls back to the rules parser if that request fails.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';

const EVENT_SCHEMA = {
    type: 'object',
    properties: {
        title: { type: 'string' },
        date: { type: 'string' },
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        allDay: { type: 'boolean' }
    },
    required: ['title', 'date', 'startTime', 'endTime', 'allDay']
};

const SYSTEM_PROMPT = `You extract exactly one calendar event from a short piece of text.
Reply with the fields from the schema and nothing else.
date is YYYY-MM-DD, or an empty string when the text has no date.
startTime and endTime are 24-hour HH:MM, or an empty string when that time is absent.
allDay is true only when there is a date and no clock time.
Weekdays named by themselves mean the next time that weekday occurs, and today counts.
"next Monday" means the Monday in the following week when today is Monday, otherwise the coming Monday.
"next week" means 7 days after today. "next month" means the same calendar day next month. "in N days" adds N days.
When a range gives am/pm on only one side, apply that period to both sides. "4 to 8pm" is 16:00 to 20:00.
A clock time with no am/pm and no leading zero, from 1:00 through 11:59, is PM. Leading zeros and hours 00 or 13-23 stay 24-hour, so 09:30 is 09:30 and 15:00 is 15:00.
Put only the event name in title. Leave out dates, times, and filler such as "on" and "at".
If the calendar date cannot exist, such as February 29 in a non-leap year, return an empty date, empty times, and allDay false. Do not move it to the next day.`;

export async function parseEventWithEngine(text, { fallback, now = new Date() } = {}) {
    const sourceText = String(text || '').trim();
    try {
        if (!GEMINI_API_KEY) throw new Error('missing Gemini API key');
        const extracted = await extractWithGemini(sourceText, now);
        const event = buildEventFromExtraction(extracted, sourceText, now);
        if (event) {
            event.engine = 'ai';
            return event;
        }
    } catch (error) {
        console.warn('Gemini parser unavailable:', error && error.message ? error.message : error);
    }

    const rules = fallback ? fallback(sourceText) : null;
    if (!rules) return null;
    return { ...rules, allDay: !!rules.allDay, engine: 'rules' };
}

export function buildEventFromExtraction(extracted, sourceText, now = new Date()) {
    if (!extracted || typeof extracted !== 'object') return null;

    const title = cleanTitle(extracted.title) || cleanTitle(sourceText) || sourceText;
    const modelDate = parseCalendarDate(extracted.date);
    const relative = hasExplicitCalendarDate(sourceText) ? null : resolveRelativeDate(sourceText, now);
    const date = relative || modelDate;
    const start = parseClock(extracted.startTime);
    const end = parseClock(extracted.endTime);

    if (extracted.date && !modelDate && !relative) {
        return emptyEvent(title);
    }

    if (!date && !start) {
        return emptyEvent(title);
    }

    if (date && !start) {
        return {
            title,
            date: formatIsoDate(date),
            time: null,
            fullDateTime: new Date(date.year, date.month, date.day),
            endDateTime: null,
            allDay: true
        };
    }

    const day = date || {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate()
    };
    const fullDateTime = new Date(day.year, day.month, day.day, start.hours, start.minutes, 0, 0);
    let endDateTime = null;
    if (end) {
        endDateTime = new Date(day.year, day.month, day.day, end.hours, end.minutes, 0, 0);
        if (endDateTime.getTime() <= fullDateTime.getTime()) {
            endDateTime.setDate(endDateTime.getDate() + 1);
        }
    }

    return {
        title,
        date: formatIsoDate(day),
        time: formatClock(start),
        fullDateTime,
        endDateTime,
        allDay: false
    };
}

async function extractWithGemini(text, now) {
    const body = JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(text.slice(0, 1000), now) }] }],
        generationConfig: {
            temperature: 0,
            maxOutputTokens: 200,
            responseMimeType: 'application/json',
            responseSchema: EVENT_SCHEMA
        }
    });

    for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch(GEMINI_URL, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': GEMINI_API_KEY
                },
                body
            });
            if (response.status === 429 && attempt < 2) {
                await delay(1000 * (attempt + 1));
                continue;
            }
            if (!response.ok) {
                throw new Error(`Gemini request failed (${response.status})`);
            }
            const payload = await response.json();
            const parts = payload.candidates?.[0]?.content?.parts || [];
            const textPart = parts.find((part) => part.text && !part.thought);
            const parsed = parseModelJson(textPart?.text || '');
            if (!parsed) throw new Error('Gemini did not return event JSON');
            return parsed;
        } finally {
            clearTimeout(timer);
        }
    }
    throw new Error('Gemini request failed (429)');
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUserPrompt(text, now) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rows = [];
    for (let offset = 0; offset < 14; offset++) {
        const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
        let label = '';
        if (offset === 0) label = ' today';
        else if (offset === 1) label = ' tomorrow';
        else if (offset === 7) label = ' next week';
        rows.push(`${formatIsoDate(partsFromDate(day))} ${weekdayName(day)}${label}`);
    }
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    rows.push(`${formatIsoDate(partsFromDate(nextMonth))} ${weekdayName(nextMonth)} next month`);

    return `Time zone: ${timeZone}
Nearby dates:
${rows.join('\n')}
Text: ${text}`;
}

function parseModelJson(raw) {
    if (typeof raw !== 'string') return null;
    try {
        return JSON.parse(raw);
    } catch {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            return JSON.parse(raw.slice(start, end + 1));
        } catch {
            return null;
        }
    }
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBER_WORDS = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
};

export function resolveRelativeDate(text, now = new Date()) {
    const lower = String(text || '').toLowerCase();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const inDays = /\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/.exec(lower);
    if (inDays) return partsFromDate(shiftDays(today, numberFrom(inDays[1])));

    const inWeeks = /\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+weeks?\b/.exec(lower);
    if (inWeeks) return partsFromDate(shiftDays(today, numberFrom(inWeeks[1]) * 7));

    if (/\btomorrow\b/.test(lower)) return partsFromDate(shiftDays(today, 1));
    if (/\btoday\b/.test(lower)) return partsFromDate(today);

    const nextNamed = /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(lower);
    if (nextNamed) return partsFromDate(weekdayFrom(today, WEEKDAYS.indexOf(nextNamed[1]), true));

    if (/\bnext\s+week\b/.test(lower)) return partsFromDate(shiftDays(today, 7));
    if (/\bnext\s+month\b/.test(lower)) return partsFromDate(sameDayNextMonth(today));

    const named = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(lower);
    if (named) return partsFromDate(weekdayFrom(today, WEEKDAYS.indexOf(named[1]), false));

    return null;
}

function hasExplicitCalendarDate(text) {
    const source = String(text || '');
    return /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(source)
        || /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(source)
        || /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/i.test(source);
}

function numberFrom(token) {
    if (/^\d+$/.test(token)) return Number(token);
    return NUMBER_WORDS[token] || 0;
}

function shiftDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function sameDayNextMonth(date) {
    const next = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());
    if (next.getDate() === date.getDate()) return next;
    return new Date(date.getFullYear(), date.getMonth() + 2, 0);
}

function weekdayFrom(today, index, nextKeyword) {
    const delta = (index - today.getDay() + 7) % 7;
    const days = nextKeyword && delta === 0 ? 7 : delta;
    return shiftDays(today, days);
}

function parseCalendarDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
        return null;
    }
    return { year, month, day };
}

function parseClock(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
}

function formatIsoDate(parts) {
    return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatClock(clock) {
    return `${String(clock.hours).padStart(2, '0')}:${String(clock.minutes).padStart(2, '0')}`;
}

function partsFromDate(date) {
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function weekdayName(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function cleanTitle(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function emptyEvent(title) {
    return {
        title,
        date: null,
        time: null,
        fullDateTime: null,
        endDateTime: null,
        allDay: false
    };
}
