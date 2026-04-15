import { useState, useEffect } from 'react';
import { useConfirm } from '../components/ConfirmDialog/ConfirmDialogContext';
import { logToServer } from '../utils/frontendLogger';

export const useTaskTopics = ({
    recordingTime,
    pauseRecording,
    resumeRecording,
    onLogEvent,
    // Dependency Injection for VAD to avoid circular loops
    onTopicAccepted,
    onTopicDeclined,
    onStartNextTopic
}) => {
    const [dynamicIndex, setDynamicIndex] = useState(0);
    const [promptTopicSwitch, setPromptTopicSwitch] = useState(false);
    const [awaitingNextTopic, setAwaitingNextTopic] = useState(false);
    const [topicStartMark, setTopicStartMark] = useState(0);

    const confirm = useConfirm();

    // Capture the current recording time whenever the topic index changes
    useEffect(() => {
        setTopicStartMark(recordingTime);
        logToServer(`Topic index changed to ${dynamicIndex}, setting topic start mark at ${recordingTime} seconds`);
    }, [dynamicIndex]);

    // --- Core Topic Handlers ---
    const handleAcceptTopicSwitch = () => {
        onLogEvent("topic_switch_accepted");
        setDynamicIndex(prev => prev + 1);
        setPromptTopicSwitch(false);
        setAwaitingNextTopic(true); // Tells UI to show the "Start Next Topic" state
        if (onTopicAccepted) onTopicAccepted();
    };

    const handleDeclineTopicSwitch = () => {
        onLogEvent("topic_switch_declined");
        setPromptTopicSwitch(false);
        if (onTopicDeclined) onTopicDeclined();
        resumeRecording();
    };

    const handleStartNextTopic = () => {
        onLogEvent("start_next_topic");
        setAwaitingNextTopic(false);
        if (onStartNextTopic) onStartNextTopic();
        resumeRecording(); 
    };

    const handleManualTopicSwitch = () => {
        onLogEvent("topic_switch_manual_triggered");
        pauseRecording();           // Freeze timer and audio buffer
        setPromptTopicSwitch(true); // Trigger the Confirm Dialog
    };

    const resetTopics = () => {
        setDynamicIndex(0);
        setAwaitingNextTopic(false);
        setPromptTopicSwitch(false);
    };

    // --- Confirm Dialog Listener ---
    useEffect(() => {
        if (promptTopicSwitch) {
            confirm({
                title: "Another topic is available",
                message: "Would you like to switch to the next topic?",
                confirmText: "Yes, switch",
                cancelText: "No, continue"
            }).then((isConfirmed) => {
                if (isConfirmed) {
                    handleAcceptTopicSwitch();
                } else {
                    handleDeclineTopicSwitch();
                }
            });
        }
    }, [promptTopicSwitch]);

    return {
        dynamicIndex,
        promptTopicSwitch,
        setPromptTopicSwitch,
        awaitingNextTopic,
        topicStartMark,
        handleStartNextTopic,
        handleManualTopicSwitch,
        resetTopics
    };
};