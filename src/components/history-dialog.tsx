"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { storage } from "@/lib/storage"
import { useState, useEffect } from "react"
import { GeneratedImage } from "@/types"
import Image from "next/image"
import { Download, Trash2, Edit } from "lucide-react"
import { Button } from "./ui/button"
import { downloadService } from '@/lib/download-service'

interface HistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditImage: (imageUrl: string) => void
}

export function HistoryDialog({ open, onOpenChange, onEditImage }: HistoryDialogProps) {
  const [history, setHistory] = useState<GeneratedImage[]>([])

  useEffect(() => {
    if (open) {
      setHistory(storage.getHistory())
    }
  }, [open])

  const handleDelete = (id: string) => {
    storage.removeFromHistory(id)
    setHistory(storage.getHistory())
  }

  const handleDownload = async (url: string) => {
    // 使用统一的下载服务
    await downloadService.downloadImage(url, {
      taskName: 'history',
      showToast: true
    })
  }

  const handleEdit = (item: GeneratedImage) => {
    onEditImage(item.url)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] max-h-[95vh] w-[98vw] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>生成历史</DialogTitle>
        </DialogHeader>
        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            暂无生成记录
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
            {history.map((item) => (
              <div key={item.id} className="relative group">
                <div className="aspect-square relative overflow-hidden rounded-lg">
                  <Image
                    src={item.url}
                    alt={item.prompt}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white hover:text-white hover:bg-white/20"
                    onClick={() => handleDownload(item.url)}
                  >
                    <Download className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white hover:text-white hover:bg-white/20"
                    onClick={() => handleEdit(item)}
                  >
                    <Edit className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white hover:text-white hover:bg-white/20"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
                <div className="mt-2 text-sm">
                  <p className="text-gray-700 line-clamp-2">{item.prompt}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
} 