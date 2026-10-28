// All four routes render the same Workbench shell; Workbench reads whichever params
// matched (see its route -> document loader effect) and opens/activates the
// corresponding docSlice tab. Unknown paths redirect to '/' rather than rendering
// anything route-shaped that doesn't exist.
import { Routes, Route, Navigate } from 'react-router-dom';
import Workbench from '../shell/Workbench';
import AccessGate from '../shell/AccessGate';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Subscriber-only: AccessGate renders <Outlet/> only once ping confirms dbAccess. */}
      <Route element={<AccessGate />}>
        <Route path="/" element={<Workbench />} />
        <Route path="/g/:gid" element={<Workbench />} />
        <Route path="/w/:wgid" element={<Workbench />} />
        <Route path="/p/:game" element={<Workbench />} />
        <Route path="/p/:game/:moves" element={<Workbench />} />
        <Route path="/a/:aid" element={<Workbench />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
