import { useEffect } from "react";

export default function useScrollToTop(dependency, delay = 100) {
  useEffect(() => {
    // A small timeout ensures React has finished mounting new components
    // and the mobile browser has recalculated the landscape layout height.
    const timer = setTimeout(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth"
      });
    }, delay); 

    // Cleanup the timer if the component unmounts quickly
    return () => clearTimeout(timer);
  }, [dependency, delay]);
}