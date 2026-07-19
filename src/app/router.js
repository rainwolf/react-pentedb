// All four routes render the same Workbench shell; Workbench reads whichever params
// matched (see its route -> document loader effect) and opens/activates the
// corresponding docSlice tab. Unknown paths redirect to '/' rather than rendering
// anything route-shaped that doesn't exist.
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Workbench from '../shell/Workbench';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Workbench />} />
      <Route path="/g/:gid" element={<Workbench />} />
      <Route path="/p/:game/:moves" element={<Workbench />} />
      <Route path="/a/:aid" element={<Workbench />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
