// src/utils/progressTracker.js

/**
 * Calculates what to display in the task progress bar based on the strategy.
 */
export const getTaskProgressDisplay = (runtimeTasks, taskIndex, randomStrategy, t) => {
    const currentTask = runtimeTasks[taskIndex];
    
    // Don't show progress for intro or consent pages
    if (!currentTask || currentTask.type === "info" || currentTask.type === "consent") {
        return null;
    }

    if (randomStrategy === "module") {
        // MODULE STRATEGY: Show progress by specific task type (e.g., "Voice Task 2/5")
        const currentType = currentTask.type;
        const totalOfType = runtimeTasks.filter((task) => task.type === currentType).length;
        const currentOfType = runtimeTasks
            .slice(0, taskIndex + 1)
            .filter((task) => task.type === currentType).length;
        
        const label = t(`taskLabels.${currentType}`, { ns: "common" });
        return { label, current: currentOfType, total: totalOfType };
    } else {
        // FIXED or GLOBAL STRATEGY: Show overall progress (e.g., "Task 3/10")
        const realTasks = runtimeTasks.filter(task => task.type !== "info" && task.type !== "consent");
        const totalRealTasks = realTasks.length;
        const currentRealTaskCount = runtimeTasks
            .slice(0, taskIndex + 1)
            .filter(task => task.type !== "info" && task.type !== "consent").length;
        
        const label = t("taskLabels.task", { ns: "common" }); // Fallback to "Task" if translation missing
        return { label, current: currentRealTaskCount, total: totalRealTasks };
    }
};

/**
 * Determines whether to show the praise overlay and what category/milestone label to use.
 */
export const checkCompletionOverlay = (runtimeTasks, currentTaskIndex, randomStrategy) => {
    const currentTask = runtimeTasks[currentTaskIndex];
    const nextTask = runtimeTasks[currentTaskIndex + 1];

    // If it's the very last task or an info/consent page, don't show the interim overlay
    if (!nextTask || currentTask.type === "info" || currentTask.type === "consent") {
        return { showOverlay: false, category: null };
    }

    if (randomStrategy === "module") {
        // MODULE STRATEGY: Trigger overlay when the task type changes (Voice -> Vision)
        if (nextTask.type !== currentTask.type) {
            return { showOverlay: true, category: currentTask.type };
        }
    } else {
        // FIXED or GLOBAL STRATEGY: Trigger on milestones
        const realTasks = runtimeTasks.filter(task => task.type !== "info" && task.type !== "consent");
        const totalRealTasks = realTasks.length;
        const currentRealTaskCount = runtimeTasks
            .slice(0, currentTaskIndex + 1)
            .filter(task => task.type !== "info" && task.type !== "consent").length;

        // Define which milestones we want to track
        let activeMilestones = [];

        // If there are less than 16 total tasks, 25% is fewer than 4 tasks.
        // In this case, we only show the 50% milestone so we don't spam the user.
        if (totalRealTasks < 16) {
            activeMilestones.push({ count: Math.ceil(totalRealTasks * 0.50), label: "milestone_50" });
        } else {
            activeMilestones.push({ count: Math.ceil(totalRealTasks * 0.25), label: "milestone_25" });
            activeMilestones.push({ count: Math.ceil(totalRealTasks * 0.50), label: "milestone_50" });
            activeMilestones.push({ count: Math.ceil(totalRealTasks * 0.75), label: "milestone_75" });
        }

        // Filter out any edge cases (like count = 0 or count >= total)
        activeMilestones = activeMilestones.filter(m => m.count > 0 && m.count < totalRealTasks); 

        // Check if the current real task count hits one of our milestones exactly
        const hitMilestone = activeMilestones.find(m => m.count === currentRealTaskCount);

        if (hitMilestone) {
            // Return the exact label (e.g., "milestone_25") to the overlay
            return { showOverlay: true, category: hitMilestone.label };
        }
    }

    return { showOverlay: false, category: null };
};