// src/utils/taskResolver.ts
import type { TaskInstance } from "../tasks.js";
import { getIllustrationPath } from "./getIllustrationPath.js";

import {
    translateTaskTitle,
    translateTaskInstructions,
    translateTaskInstructionsActive,
    getResolvedParams
  } from "./translations.js";
  
/**
 * Expands all tasks with repeat count and resolves their translations + params.
 */
export function resolveTasks(tasks: TaskInstance[]) {
    const expandedTasks = tasks.flatMap(task => {
      const repeat = task.repeat ?? 1;
      return Array.from({ length: repeat }, (_, i) => ({
        ...task,
        _repeatIndex: i + 1,
        _repeatTotal: repeat,
      }));
    });
  
    return expandedTasks.map(resolveTask);
  }
  
  /**
   * Returns a fully prepared (resolved) task object with all translations and params resolved.
   */
  export function resolveTask(task: TaskInstance | null) {
    if (!task) return null;
  
    const resolvedParams = getResolvedParams(task.category, task.params);
    const titleBase = translateTaskTitle(task.category, resolvedParams);

    // Build static illustration path
    const illustration = getIllustrationPath(task.category, task.params);
  
    return {
      ...task,
      resolvedParams,
      useVAD: task.useVAD,
      title:
        (task._repeatTotal ?? 1) > 1
          ? `${titleBase} #${task._repeatIndex ?? 1}`
          : titleBase,
      instructions: translateTaskInstructions(task.category, resolvedParams),
      instructionsActive:
        translateTaskInstructionsActive(task.category, resolvedParams),
      illustration,
    };
  }