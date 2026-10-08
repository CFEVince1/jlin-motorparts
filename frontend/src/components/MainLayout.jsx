import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const MainLayout = () => {
    return (
        <div className="app-container">
            <aside className="print-hide" style={{ height: '100vh', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <Sidebar />
            </aside>
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;
