// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { classifyMediaError, MEDIA_ERROR_TYPE } from './mediaErrorType';

describe('classifyMediaError', () => {
    it('classifies explicit permission denials', () => {
        expect(classifyMediaError({ name: 'NotAllowedError' })).toBe(MEDIA_ERROR_TYPE.DENIED);
        expect(classifyMediaError({ name: 'PermissionDeniedError' })).toBe(MEDIA_ERROR_TYPE.DENIED);
    });

    it('classifies a missing/disconnected device', () => {
        expect(classifyMediaError({ name: 'NotFoundError' })).toBe(MEDIA_ERROR_TYPE.MISSING);
        expect(classifyMediaError({ name: 'DevicesNotFoundError' })).toBe(MEDIA_ERROR_TYPE.MISSING);
    });

    it('classifies a device already in use by another app', () => {
        expect(classifyMediaError({ name: 'NotReadableError' })).toBe(MEDIA_ERROR_TYPE.BUSY);
        expect(classifyMediaError({ name: 'TrackStartError' })).toBe(MEDIA_ERROR_TYPE.BUSY);
    });

    it('falls back to generic for unrecognized or missing error info', () => {
        expect(classifyMediaError({ name: 'OverconstrainedError' })).toBe(MEDIA_ERROR_TYPE.GENERIC);
        expect(classifyMediaError(new Error('face model load timed out'))).toBe(MEDIA_ERROR_TYPE.GENERIC);
        expect(classifyMediaError(null)).toBe(MEDIA_ERROR_TYPE.GENERIC);
        expect(classifyMediaError(undefined)).toBe(MEDIA_ERROR_TYPE.GENERIC);
    });
});
