import {memo, useEffect, useState} from 'react';
// Only the counter renders once per second; the surrounding controls stay untouched.
export const FrameRate = memo(function FrameRate({frames}) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let previous = frames.current;
    const timer = setInterval(() => {
      const current = frames.current;
      setFps(Math.max(0, current - previous)); previous = current;
    }, 1000);
    return () => clearInterval(timer);
  }, [frames]);
  return <>{fps} fps</>;
});
