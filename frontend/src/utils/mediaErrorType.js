// Classifies a getUserMedia() (camera/microphone) rejection into a small set
// of user-facing categories. A plain "permission denied" message is wrong
// advice for a missing/busy device, so callers use this to pick the right
// copy instead of collapsing every failure into "access denied".
export const MEDIA_ERROR_TYPE = {
    DENIED: 'denied',
    MISSING: 'missing',
    BUSY: 'busy',
    GENERIC: 'generic',
};

export function classifyMediaError(err) {
    switch (err?.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return MEDIA_ERROR_TYPE.DENIED;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return MEDIA_ERROR_TYPE.MISSING;
        case 'NotReadableError':
        case 'TrackStartError':
            return MEDIA_ERROR_TYPE.BUSY;
        default:
            return MEDIA_ERROR_TYPE.GENERIC;
    }
}
