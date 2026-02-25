import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    console.log('[CEB] Facebook automation activity loaded');
  }, []);

  return <div className="ceb-facebook-runtime-content-view-text">Facebook automation activity</div>;
}
