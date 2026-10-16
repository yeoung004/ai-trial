import { useEffect, useState } from "react";
export function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const change = () => setPath(location.pathname);
    addEventListener("popstate", change);
    return () => removeEventListener("popstate", change);
  }, []);
  return {
    path,
    navigate: (next: string) => {
      history.pushState(null, "", next);
      setPath(next);
      window.scrollTo(0, 0);
    },
  };
}
