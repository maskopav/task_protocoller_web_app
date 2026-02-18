// src/utils/randomizer.ts
export const randomizeTasks = (tasks: any[], settings: any = {}) => {
  const strategy = settings?.strategy || 'none';
  const config = settings?.moduleSettings || {};

  const shuffle = (array: any[]) => {
    const arr = [...array]; 
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  if (strategy === 'global') {
    return shuffle(tasks);
  }

  if (strategy === 'module') {
    let blocks: any[][] = [];
    let currentBlock: any[] = [];
    
    tasks.forEach((task, index) => {
      const prevTask = tasks[index - 1];
      // Note: Ensure your tasks have a 'type' property
      const isSameType = index > 0 && prevTask && prevTask.type === task.type;

      if (index === 0 || isSameType) {
        currentBlock.push(task);
      } else {
        blocks.push(currentBlock);
        currentBlock = [task];
      }
    });
    if (currentBlock.length > 0) blocks.push(currentBlock);

    if (config.shuffleWithin) {
      blocks = blocks.map(block => shuffle(block));
    }

    if (config.shuffleBlocks) {
      blocks = shuffle(blocks);
    }

    return blocks.flat();
  }

  return tasks;
};