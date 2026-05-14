import { useEffect } from "react";

export default function useScrollToTop(dependency) {
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth"
    });
  }, [dependency]); // It will trigger whenever the dependency changes
}