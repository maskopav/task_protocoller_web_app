// frontend/src/VideoRecorderTest.jsx
import React from 'react';
import { VideoRecorder } from './components/VideoRecorder/VideoRecorder';

const VideoRecorderTest = () => {
    const handleNextTask = (data) => {
        console.log("Task Completed. Data saved:", data);
        alert("Recording saved to memory! Check console for Blob URL.");
    };

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <VideoRecorder 
                title="Clinical Video Test"
                instructions="Please look directly at the camera and count from 1 to 10."
                onNextTask={handleNextTask}
            />
        </div>
    );
};

export default VideoRecorderTest;