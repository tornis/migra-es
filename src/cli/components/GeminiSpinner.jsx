import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import gradient from 'gradient-string';

/**
 * Gemini-style animated spinner
 */
export default function GeminiSpinner({ text = 'Loading' }) {
  const [frame, setFrame] = useState(0);
  
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const geminiGradient = gradient(['#fbbc04', '#f4b400', '#ff9800', '#ffc107']);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, 80);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box>
      <Text>{geminiGradient(frames[frame])} </Text>
      <Text>{text}</Text>
      <Text>{geminiGradient('...')}</Text>
    </Box>
  );
}
