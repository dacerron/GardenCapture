// src/Viewer.tsx
import { useEffect, useRef } from 'react'
import { ThreeApp } from './three/ThreeApp'
import './index.css'

export default function Viewer() {
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!wrapRef.current) return
    const app = new ThreeApp(wrapRef.current)
    return () => app.dispose()
  }, [])

  return <div className="threeWrap" ref={wrapRef} />
}
