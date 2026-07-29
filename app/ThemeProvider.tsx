"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
type Theme="system"|"light"|"dark";
const ThemeContext=createContext<{theme:Theme;resolvedTheme:"light"|"dark";setTheme:(theme:Theme)=>void}|null>(null);
const key="restaurant-ui-theme";
export function ThemeProvider({children}:{children:React.ReactNode}){
  const[theme,setThemeState]=useState<Theme>(()=>{if(typeof window==="undefined")return"system";const stored=localStorage.getItem(key);return stored==="system"||stored==="light"||stored==="dark"?stored:"system"});
  const[resolvedTheme,setResolvedTheme]=useState<"light"|"dark">(()=>typeof window!=="undefined"&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
  useEffect(()=>{const media=matchMedia("(prefers-color-scheme: dark)");const apply=()=>{const resolved=theme==="system"?(media.matches?"dark":"light"):theme;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;setResolvedTheme(resolved)};apply();media.addEventListener("change",apply);return()=>media.removeEventListener("change",apply)},[theme]);
  const setTheme=(value:Theme)=>{localStorage.setItem(key,value);setThemeState(value)};const value=useMemo(()=>({theme,resolvedTheme,setTheme}),[theme,resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
export const useTheme=()=>{const value=useContext(ThemeContext);if(!value)throw new Error("useTheme must be used inside ThemeProvider");return value};
