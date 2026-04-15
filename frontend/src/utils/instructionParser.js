/**
 * Replaces template tags like {{topic}} or {{key}} in a string with actual values.
 */
export const interpolateInstructions = (text, isDynamicTask, currentItem, taskParams, dynamicArray) => {
    if (!isDynamicTask || typeof text !== 'string' || !currentItem) {
        return text;
    }

    let parsedText = text;
    // Find the parameter key that matches our dynamic array (usually "topic")
    const paramKey = Object.keys(taskParams).find(k => taskParams[k] === dynamicArray) || "topic";

    if (typeof currentItem === 'string') {
        parsedText = parsedText.replace(new RegExp(`{{${paramKey}}}`, 'g'), currentItem);
    } else if (typeof currentItem === 'object' && currentItem !== null) {
        Object.entries(currentItem).forEach(([key, value]) => {
            parsedText = parsedText.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        });
    }

    return parsedText;
};