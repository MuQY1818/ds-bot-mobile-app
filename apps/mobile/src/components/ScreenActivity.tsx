import { createContext, useContext } from 'react';

// Retained native pages stay mounted; effects must explicitly follow focus.
export const ScreenActivity = createContext(true);
export const useScreenActivity = () => useContext(ScreenActivity);
