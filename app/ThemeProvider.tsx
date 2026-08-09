"use client";
// Web support code used by the main page.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
type Theme="system"|"light"|"dark";
const ThemeContext=createContext<{theme:Theme;resolvedTheme:"light"|"dark";setTheme:(theme:Theme)=>void}|null>(null);
const key="restaurant-ui-theme";
export function ThemeProvider({children}:{children:React.ReactNode}){
  // Match the server's initial render, then restore the saved theme after hydration.
  const[theme,setThemeState]=useState<Theme>("system");
  const[resolvedTheme,setResolvedTheme]=useState<"light"|"dark">("light");
  useEffect(()=>{const stored=localStorage.getItem(key);if(stored==="system"||stored==="light"||stored==="dark")queueMicrotask(()=>setThemeState(stored))},[]);
  useEffect(()=>{const media=matchMedia("(prefers-color-scheme: dark)");const apply=()=>{const resolved=theme==="system"?(media.matches?"dark":"light"):theme;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;setResolvedTheme(resolved)};apply();media.addEventListener("change",apply);return()=>media.removeEventListener("change",apply)},[theme]);
  // Function: changes and saves set theme and returns its result to the caller.
  const setTheme=(value:Theme)=>{localStorage.setItem(key,value);setThemeState(value)};const value=useMemo(()=>({theme,resolvedTheme,setTheme}),[theme,resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
export const useTheme=()=>{const value=useContext(ThemeContext);if(!value)throw new Error("useTheme must be used inside ThemeProvider");return value};
