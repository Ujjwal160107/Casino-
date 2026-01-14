"use client";

import { useState } from "react";
import { Plus, Trash2, MessageSquare } from "lucide-react";

interface SentenceEditorProps {
    title: string;
    description: string;
    sentences: string[];
    onChange: (sentences: string[]) => void;
    placeholder?: string;
    maxLimit?: number;
    disabled?: boolean;
}

export function SentenceEditor({
    title,
    description,
    sentences = [],
    onChange,
    placeholder = "Type a funny response...",
    maxLimit = 10,
    disabled = false
}: SentenceEditorProps) {
    const [newItem, setNewItem] = useState("");

    const handleAdd = () => {
        if (disabled) return;
        if (!newItem.trim()) return;
        if (sentences.length >= maxLimit) return;

        onChange([...sentences, newItem.trim()]);
        setNewItem("");
    };

    const handleDelete = (index: number) => {
        if (disabled) return;
        onChange(sentences.filter((_, i) => i !== index));
    };

    return (
        <div className={`bg-black/20 rounded-lg border border-white/5 p-4 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={16} className="text-zinc-400" />
                <h4 className="text-sm font-bold text-white">{title}</h4>
                <span className="text-xs text-zinc-500 ml-auto">{sentences.length}/{maxLimit}</span>
            </div>
            <p className="text-xs text-zinc-500 mb-4">{description}</p>

            <div className="space-y-2 mb-4">
                {sentences.length === 0 && (
                    <div className="text-xs text-zinc-600 italic py-2 text-center border border-dashed border-white/5 rounded">
                        No custom sentences. Default bot messages will be used.
                    </div>
                )}
                {sentences.map((sentence, i) => (
                    <div key={i} className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded border border-white/5 group">
                        <span className="text-sm text-zinc-300 flex-1 truncate">{sentence}</span>
                        <button
                            onClick={() => handleDelete(i)}
                            className="text-zinc-600 group-hover:text-red-400 transition-colors p-1"
                            disabled={disabled}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <div className="flex gap-2">
                <input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-yellow-500/50 outline-none"
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    disabled={disabled || sentences.length >= maxLimit}
                />
                <button
                    onClick={handleAdd}
                    disabled={disabled || !newItem.trim() || sentences.length >= maxLimit}
                    className="bg-zinc-800 text-white px-3 py-2 rounded hover:bg-zinc-700 disabled:opacity-50"
                >
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
}
