import { useEffect } from 'react';

/**
 * Prevents the user from accidentally closing the tab, refreshing the page, 
 * or navigating away by triggering the browser's default warning dialog.
 * * @param {boolean} isEnabled - Set to true when the task/recording is active
 */
export const usePreventNavigation = (isEnabled) => {
    useEffect(() => {
        const handleBeforeUnload = (event) => {
            if (!isEnabled) return;

            // Trigger the browser's default warning dialog
            event.preventDefault(); 
            // Chrome, Edge, Safari, and Firefox require returnValue to be set
            event.returnValue = ''; 
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        // Cleanup the event listener when the component unmounts or state changes
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isEnabled]);
};