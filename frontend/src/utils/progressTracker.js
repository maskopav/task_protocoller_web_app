// src/utils/progressTracker.js

// 1. Centralize the excluded task types
const NON_PROGRESS_TASKS = ["info", "consent", "identifiers", "mic_check", "volume_check"];

/**
 * Helper to determine if a task should be counted toward progress or trigger overlays.
 */
const isRealTask = (task) => {
    return task && !NON_PROGRESS_TASKS.includes(task.type);
};

/**
 * Calculates what to display in the task progress bar based on the strategy.
 */
export const getTaskProgressDisplay = (runtimeTasks, taskIndex, randomStrategy, t) => {
    const currentTask = runtimeTasks[taskIndex];
    
    // 2. Use the helper for early returns
    if (!isRealTask(currentTask)) {
        return null;
    }

    const pastAndCurrentTasks = runtimeTasks.slice(0, taskIndex + 1);

    if (randomStrategy === "module") {
        // MODULE STRATEGY: Show progress by specific task type (e.g., "Voice Task 2/5")
        const currentType = currentTask.type;
        const totalOfType = runtimeTasks.filter((task) => task.type === currentType).length;
        const currentOfType = pastAndCurrentTasks.filter((task) => task.type === currentType).length;
        
        const label = t(`taskLabels.${currentType}`, { ns: "common" });
        return { label, current: currentOfType, total: totalOfType };
    } else {
        // FIXED or GLOBAL STRATEGY: Show overall progress (e.g., "Task 3/10")
        // 3. Use the helper as the callback for the filter method
        const totalRealTasks = runtimeTasks.filter(isRealTask).length;
        const currentRealTaskCount = pastAndCurrentTasks.filter(isRealTask).length;
        
        const label = t("taskLabels.task", { ns: "common" });
        return { label, current: currentRealTaskCount, total: totalRealTasks };
    }
};

/**
 * Determines whether to show the praise overlay and what category/milestone label to use.
 */
export const checkCompletionOverlay = (runtimeTasks, currentTaskIndex, randomStrategy) => {
    const currentTask = runtimeTasks[currentTaskIndex];
    const nextTask = runtimeTasks[currentTaskIndex + 1];

    // If it's the very last task or a non-progress page, don't show the interim overlay
    if (!nextTask || !isRealTask(currentTask)) {
        return { showOverlay: false, category: null };
    }

    if (randomStrategy === "module") {
        // MODULE STRATEGY: Trigger overlay when the task type changes (Voice -> Vision)
        if (nextTask.type !== currentTask.type) {
            return { showOverlay: true, category: currentTask.type };
        }
    } else {
        // FIXED or GLOBAL STRATEGY: Trigger on milestones
        const totalRealTasks = runtimeTasks.filter(isRealTask).length;
        const currentRealTaskCount = runtimeTasks
            .slice(0, currentTaskIndex + 1)
            .filter(isRealTask).length;

        let activeMilestones = [];

        // Define which milestones we want to track based on total tasks
        if (totalRealTasks < 16) {
            activeMilestones.push({ count: Math.ceil(totalRealTasks * 0.50), label: "milestone_50" });
        } else {
            activeMilestones.push({ count: Math.ceil(totalRealTasks * 0.25), label: "milestone_25" });
            activeMilestones.push({ count: Math.ceil(totalRealTasks * 0.50), label: "milestone_50" });
            activeMilestones.push({ count: Math.ceil(totalRealTasks * 0.75), label: "milestone_75" });
        }

        // Find if the current real task count hits a valid milestone exactly
        const hitMilestone = activeMilestones.find(m => 
            m.count > 0 && 
            m.count < totalRealTasks && 
            m.count === currentRealTaskCount
        );

        if (hitMilestone) {
            return { showOverlay: true, category: hitMilestone.label };
        }
    }

    return { showOverlay: false, category: null };
};