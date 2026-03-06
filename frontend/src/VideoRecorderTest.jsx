import React, { useState } from 'react';
import { VideoRecorder } from './components/VideoRecorder/VideoRecorder';

export const VideoRecorderTest = () => {
    const [audioUrl, setAudioUrl] = useState(null);
    const [coordinateData, setCoordinateData] = useState(null);
    const [isFinished, setIsFinished] = useState(false); // Add a finished state

    const handleNextTask = (data) => {
        console.log("Task Completed. Data saved:", data);
        
        // --- DATA ANALYSIS ---
        const coords = data.coordinates;
        if (coords.length > 1) {
            const firstTime = coords[0].timestamp;
            const lastTime = coords[coords.length - 1].timestamp;
            const totalDurationMs = lastTime - firstTime;
            const averageFps = (coords.length / (totalDurationMs / 1000)).toFixed(2);
            
            let maxInterval = 0;
            let minInterval = 9999;
            
            for (let i = 1; i < coords.length; i++) {
                const interval = coords[i].timestamp - coords[i-1].timestamp;
                if (interval > maxInterval) maxInterval = interval;
                if (interval < minInterval) minInterval = interval;
            }

            console.log(`📊 --- RECORDING REPORT ---`);
            console.log(`Total Frames Captured: ${coords.length}`);
            console.log(`Total Duration: ${(totalDurationMs / 1000).toFixed(2)} seconds`);
            console.log(`Average Framerate: ${averageFps} FPS`);
            console.log(`Fastest Frame: ${minInterval.toFixed(2)} ms`);
            console.log(`Slowest Frame (Max Lag): ${maxInterval.toFixed(2)} ms`);
            console.log(`--------------------------`);
        }

        // Create a playable URL from the audio blob
        const audioBlobUrl = URL.createObjectURL(data.audioBlob);
        setAudioUrl(audioBlobUrl);
        setCoordinateData(data.coordinates);
        setIsFinished(true); 
    };

    const downloadCoordinates = () => {
        if (!coordinateData) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(coordinateData));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "neuroshare_coordinates.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            
            {/* ONLY show the recorder if we are NOT finished */}
            {!isFinished && (
                <VideoRecorder 
                    title="Clinical Video Test"
                    instructions="Please look directly at the camera and count from 1 to 10."
                    onNextTask={handleNextTask}
                />
            )}

            {/* When finished, show this Results panel instead! */}
            {isFinished && audioUrl && coordinateData && (
                <div style={{ padding: '30px', backgroundColor: '#1a1a1a', borderRadius: '12px', color: 'white', textAlign: 'center', border: '2px solid #4caf50' }}>
                    <h2 style={{ color: '#4caf50' }}>✅ Recording Successful!</h2>
                    <p style={{ marginBottom: '30px' }}>The camera has been closed. Your privacy is secured.</p>
                    
                    <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#2a2a2a', borderRadius: '8px' }}>
                        <p style={{ margin: '0 0 10px 0' }}><strong>Step 1: Verify Audio (No Video Saved)</strong></p>
                        <audio src={audioUrl} controls style={{ width: '100%' }} />
                    </div>

                    <div style={{ padding: '20px', backgroundColor: '#2a2a2a', borderRadius: '8px' }}>
                        <p style={{ margin: '0 0 10px 0' }}><strong>Step 2: Verify Facial Coordinates</strong></p>
                        <p style={{ color: '#00FF00', fontSize: '1.2rem' }}>Captured {coordinateData.length} frames of data!</p>
                        <button 
                            onClick={downloadCoordinates} 
                            style={{ padding: '15px 30px', cursor: 'pointer', backgroundColor: '#4caf50', border: 'none', color: 'white', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '10px' }}
                        >
                            Download JSON Coordinates
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoRecorderTest;