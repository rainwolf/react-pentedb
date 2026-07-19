import React from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BoardStory from './board/BoardStory';

const theme = createTheme();

// /board-story is temporary scaffolding for P2 Task 2 Step 4 (render smoke
// test) — left in place per the task brief as scaffolding for later tasks
// to replace, not a permanent app route.
function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <div className="App">
                <h1>pentedb</h1>
              </div>
            }
          />
          <Route path="/board-story" element={<BoardStory />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
