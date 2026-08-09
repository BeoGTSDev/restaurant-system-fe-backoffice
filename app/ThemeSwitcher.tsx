"use client";
// Web support code used by the main page.
import{useEffect,useRef,useState}from"react";import{useTheme}from"./ThemeProvider";
export default function ThemeSwitcher(){const{theme,resolvedTheme,setTheme}=useTheme();const[open,setOpen]=useState(false);const root=useRef<HTMLDivElement>(null);
useEffect(()=>{const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close)},[]);
return <div className="themeSwitcher" ref={root}><button className="themeButton" type="button" aria-label={`Theme: ${theme}. Current appearance: ${resolvedTheme}`} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{resolvedTheme==="dark"?"☾":"☀"}</button>{open&&<div className="themeMenu" role="menu" aria-label="Choose appearance">{(["system","light","dark"]as const).map(value=><button key={value} role="menuitemradio" aria-checked={theme===value} onClick={()=>{setTheme(value);setOpen(false)}}>{value==="system"?"System":value==="light"?"Light":"Dark"}</button>)}</div>}</div>}
