import { describe, it, expect } from 'vitest';
import { interpolateInstructions } from './instructionParser';

describe('interpolateInstructions', () => {
  it('returns the text unchanged when the task is not dynamic', () => {
    expect(interpolateInstructions('Say {{topic}}', false, 'dogs', {}, [])).toBe('Say {{topic}}');
  });

  it('returns the text unchanged when there is no current item', () => {
    expect(interpolateInstructions('Say {{topic}}', true, null, {}, [])).toBe('Say {{topic}}');
  });

  it('returns non-string text unchanged', () => {
    expect(interpolateInstructions(null, true, 'dogs', {}, [])).toBeNull();
  });

  it('substitutes a string current item using the param key that references dynamicArray', () => {
    const dynamicArray = ['dogs', 'cats'];
    const taskParams = { topic: dynamicArray };
    const result = interpolateInstructions('Talk about {{topic}}', true, 'dogs', taskParams, dynamicArray);
    expect(result).toBe('Talk about dogs');
  });

  it('falls back to "topic" as the param key when no match is found', () => {
    const result = interpolateInstructions('Talk about {{topic}}', true, 'dogs', {}, ['dogs']);
    expect(result).toBe('Talk about dogs');
  });

  it('substitutes multiple placeholders from an object current item', () => {
    const currentItem = { name: 'Alice', age: 30 };
    const result = interpolateInstructions(
      'Hello {{name}}, you are {{age}}',
      true,
      currentItem,
      {},
      []
    );
    expect(result).toBe('Hello Alice, you are 30');
  });

  it('replaces every occurrence of a repeated placeholder', () => {
    const currentItem = { name: 'Alice' };
    const result = interpolateInstructions('{{name}} and {{name}} again', true, currentItem, {}, []);
    expect(result).toBe('Alice and Alice again');
  });
});
