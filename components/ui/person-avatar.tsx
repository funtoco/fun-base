"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { isKintonePlaceholderImagePath } from "@/lib/people/person-image"

interface PersonAvatarProps {
  name: string
  imagePath?: string
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8", 
  lg: "h-12 w-12",
  xl: "h-20 w-20"
}

const textSizeClasses = {
  sm: "text-xs",
  md: "text-xs",
  lg: "text-sm", 
  xl: "text-2xl"
}

// Simple client-side cache for Supabase signed image URLs
type CachedEntry = { url: string; expiresAt: number }
const memoryCache: Map<string, CachedEntry> = (globalThis as any).__personAvatarUrlCache || new Map<string, CachedEntry>()
;(globalThis as any).__personAvatarUrlCache = memoryCache

const LOCAL_STORAGE_KEY = 'person-avatar-url-cache'
const SKEW_SECONDS = 300 // refresh 5 minutes early
const TTL_SECONDS = 3600 // matches createSignedUrl duration (1 hour)

function readLocalCache(): Record<string, CachedEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, CachedEntry>
  } catch {
    return {}
  }
}

function writeLocalCache(entries: Record<string, CachedEntry>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // ignore quota/serialization errors
  }
}

function getFromCache(path: string): string | null {
  const now = Date.now()
  const mem = memoryCache.get(path)
  if (mem && mem.expiresAt > now) return mem.url

  const ls = readLocalCache()
  const entry = ls[path]
  if (entry && entry.expiresAt > now) {
    memoryCache.set(path, entry)
    return entry.url
  }
  return null
}

function saveToCache(path: string, url: string) {
  const expiresAt = Date.now() + (TTL_SECONDS - SKEW_SECONDS) * 1000
  const entry: CachedEntry = { url, expiresAt }
  memoryCache.set(path, entry)
  const ls = readLocalCache()
  ls[path] = entry
  writeLocalCache(ls)
}

/**
 * デコードされたファイル名を取得
 */
function decodeFileName(encodedFileName: string): string {
  try {
    // RFC 2047形式のエンコードをデコード
    if (encodedFileName.includes('=?UTF-8?B?')) {
      const base64Match = encodedFileName.match(/\?B\?([^?]+)\?=/g)
      if (base64Match) {
        let decoded = ''
        for (const match of base64Match) {
          const base64 = match.replace(/\?B\?/, '').replace(/\?=/, '')
          try {
            decoded += Buffer.from(base64, 'base64').toString('utf-8')
          } catch (e) {
            console.warn('Failed to decode base64:', base64)
          }
        }
        return decoded
      }
    }
    return encodedFileName
  } catch (error) {
    console.warn('Failed to decode filename:', encodedFileName, error)
    return encodedFileName
  }
}

/**
 * 署名付きURLを生成
 */
const getSignedUrl = async (filePath: string): Promise<string | null> => {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('people-images')
      .createSignedUrl(filePath, 3600) // 1時間有効

    if (error) {
      console.error('Storage API Error:', error)
      console.error('Error details:', { 
        filePath, 
        errorCode: error.statusCode,
        errorMessage: error.message,
        errorDetails: error
      })
      return null
    }
    
    return data.signedUrl
  } catch (error) {
    console.error('Exception in getSignedUrl:', error)
    return null
  }
}

export function PersonAvatar({ 
  name, 
  imagePath, 
  className,
  size = "md"
}: PersonAvatarProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const displayImagePath = isKintonePlaceholderImagePath(imagePath) ? undefined : imagePath

  useEffect(() => {
    if (!displayImagePath) {
      setImageUrl(null)
      setError(false)
      setLoading(false)
      return
    }

    // 無効なimagePathの場合はスキップ
    if (displayImagePath === 'null' || displayImagePath === 'undefined' || displayImagePath.trim() === '') {
      setImageUrl(null)
      setError(false)
      setLoading(false)
      return
    }

    const cached = getFromCache(displayImagePath)
    if (cached) {
      setImageUrl(cached)
      setError(false)
      setLoading(false)
      return
    }

    let active = true
    const fetchSignedUrl = async () => {
      setLoading(true)
      setError(false)
      try {
        const signedUrl = await getSignedUrl(displayImagePath)
        if (!active) return
        if (signedUrl) {
          saveToCache(displayImagePath, signedUrl)
          setImageUrl(signedUrl)
        } else {
          setError(true)
        }
      } catch {
        if (!active) return
        setError(true)
      } finally {
        if (!active) return
        setLoading(false)
      }
    }
    fetchSignedUrl()
    return () => { active = false }
  }, [displayImagePath])

  const handleImageError = () => {
    console.warn('Failed to load image for person:', name, 'path:', imagePath)
    setError(true)
  }
  
  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      {imageUrl && !error && (
        <AvatarImage 
          src={imageUrl} 
          alt={name}
          className="object-cover"
          loading="lazy"
          decoding="async"
          onError={handleImageError}
        />
      )}
      <AvatarFallback className={textSizeClasses[size]}>
        {loading ? "..." : name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}
