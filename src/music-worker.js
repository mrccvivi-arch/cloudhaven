import { renderTheme } from "./music-score.js";

self.onmessage = ({ data: theme }) => {
  const samples = renderTheme(theme);
  self.postMessage({ theme, samples }, [samples.buffer]);
};
