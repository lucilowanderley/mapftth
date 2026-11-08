import { useEffect, useRef, useState } from "react";

/** Uma opção do leque. `tools` com mais de uma ferramenta = ferramentas fundidas num botão só (ex.: CTO/CEO); a escolha entre elas fica na faixa abaixo da barra. */
export interface FanItem<T extends string> {
    key: string;
    label: string;
    icon: React.ReactNode;
    tools: T[];
}

/** Um grupo da barra: um botão que abre as opções em leque. Grupo com uma opção só vira botão direto. */
export interface FanGroup<T extends string> {
    key: string;
    label: string;
    items: FanItem<T>[];
}

/** Posição de cada opção no arco abaixo do botão, da esquerda para a direita (90° = para baixo). */
function fanPositions(n: number) {
    if (n <= 1) return [{ x: 0, y: 78 }];
    const radius = n >= 4 ? 104 : 92;
    const step = n >= 4 ? 46 : 52;
    const start = 90 - (step * (n - 1)) / 2;
    return Array.from({ length: n }, (_, i) => {
        const a = ((start + step * i) * Math.PI) / 180;
        return {
            x: -Math.round(radius * Math.cos(a)),
            y: Math.round(radius * Math.sin(a)),
        };
    });
}

/** Botão da barra só com o ícone; o nome aparece na dica ao passar o mouse (title). */
const BTN =
    "flex h-9 w-9 items-center justify-center rounded-md cursor-pointer";

/**
 * Barra de ferramentas agrupada: cada grupo mostra a última ferramenta usada nele; um clique abre as outras em leque
 * abaixo do botão (clique numa delas, fora do leque ou Esc fecha).
 */
export default function ToolFan<T extends string>({
    groups,
    tool,
    onPick,
}: {
    groups: FanGroup<T>[];
    tool: T;
    onPick: (t: T) => void;
}) {
    const [open, setOpen] = useState<string | null>(null);
    // Última opção usada de cada grupo e última ferramenta de cada opção fundida.
    const [lastItem, setLastItem] = useState<Record<string, string>>({});
    const [lastTool, setLastTool] = useState<Record<string, T>>({});
    const rootRef = useRef<HTMLDivElement>(null);

    // A ferramenta pode mudar por fora (Esc, painel que fecha, "Posicionar reserva"...): lembra dela no grupo.
    useEffect(() => {
        for (const g of groups)
            for (const it of g.items)
                if (it.tools.includes(tool)) {
                    setLastItem((m) =>
                        m[g.key] === it.key ? m : { ...m, [g.key]: it.key },
                    );
                    setLastTool((m) =>
                        m[it.key] === tool ? m : { ...m, [it.key]: tool },
                    );
                }
    }, [tool, groups]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node))
                setOpen(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopImmediatePropagation();
                setOpen(null);
            }
        };
        window.addEventListener("pointerdown", onDown, true);
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("pointerdown", onDown, true);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [open]);

    const pickItem = (it: FanItem<T>) => {
        setOpen(null);
        const t = it.tools.includes(tool)
            ? tool
            : (lastTool[it.key] ?? it.tools[0]);
        onPick(t);
    };

    return (
        <div ref={rootRef} className="contents">
            {groups.map((g) => {
                if (g.items.length === 0) return null;
                const activeItem = g.items.find((it) =>
                    it.tools.includes(tool),
                );
                if (g.items.length === 1) {
                    const it = g.items[0];
                    return (
                        <button
                            key={g.key}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => pickItem(it)}
                            className={`${BTN} ${activeItem ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
                            title={it.label}
                            aria-label={it.label}
                        >
                            {it.icon}
                        </button>
                    );
                }
                const shown =
                    activeItem ??
                    g.items.find((it) => it.key === lastItem[g.key]) ??
                    g.items[0];
                const isOpen = open === g.key;
                const pos = fanPositions(g.items.length);
                const maxX = Math.max(...pos.map((p) => Math.abs(p.x)));
                const maxY = Math.max(...pos.map((p) => p.y));
                return (
                    <div key={g.key} className="relative">
                        <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => setOpen(isOpen ? null : g.key)}
                            className={`${BTN} relative ${
                                activeItem
                                    ? "bg-emerald-600 text-white"
                                    : isOpen
                                      ? "bg-slate-800 text-white"
                                      : "text-slate-300 hover:bg-slate-800"
                            }`}
                            title={`${g.label}: ${g.items.map((it) => it.label).join(", ")}`}
                            aria-label={g.label}
                            aria-expanded={isOpen}
                        >
                            {shown.icon}
                            <span
                                className={`absolute right-0.5 bottom-0.5 border-l-[5px] border-l-transparent border-b-[5px] ${activeItem ? "border-b-emerald-200" : "border-b-slate-500"}`}
                            />
                        </button>
                        {isOpen && (
                            <div className="absolute left-1/2 top-full z-[1100] pointer-events-none">
                                {/* Meia-lua de fundo, para o leque se destacar do mapa */}
                                <div
                                    className="absolute rounded-b-[999px] bg-slate-950/55 backdrop-blur-[2px]"
                                    style={{
                                        width: 2 * (maxX + 52),
                                        height: maxY + 62,
                                        left: -(maxX + 52),
                                        top: 0,
                                    }}
                                />
                                {g.items.map((it, i) => {
                                    const active = it.tools.includes(tool);
                                    return (
                                        <button
                                            key={it.key}
                                            onPointerDown={(e) =>
                                                e.stopPropagation()
                                            }
                                            onClick={() => pickItem(it)}
                                            className="tool-fan-item absolute flex flex-col items-center gap-0.5 pointer-events-auto cursor-pointer group"
                                            style={{
                                                left: pos[i].x,
                                                top: pos[i].y - 12,
                                                animationDelay: `${i * 25}ms`,
                                            }}
                                            title={it.label}
                                        >
                                            <span
                                                className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg ${
                                                    active
                                                        ? "bg-emerald-600 border-emerald-400 text-white"
                                                        : "bg-slate-900 border-slate-700 text-slate-200 group-hover:bg-slate-800 group-hover:border-emerald-500"
                                                }`}
                                            >
                                                {it.icon}
                                            </span>
                                            <span className="rounded bg-slate-900/90 px-1 text-[10px] uppercase tracking-wide text-slate-200 whitespace-nowrap">
                                                {it.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
