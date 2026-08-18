import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: T[];
  label?: string;
  className?: string;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className = "",
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="mb-[6px] block text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--color-neutral-600)]">
          {label}
        </label>
      )}
      <div
        className={`flex w-full cursor-pointer items-center justify-between rounded-[10px] border px-4 py-2.5 text-[14px] transition-colors ${
          isOpen
            ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)] bg-white"
            : "border-[var(--color-neutral-300)] bg-white hover:border-[var(--color-neutral-400)]"
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="block truncate text-[var(--color-neutral-900)]">
          {value}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-[var(--color-neutral-500)] transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 max-h-60 w-full overflow-auto rounded-[12px] border border-[var(--color-neutral-200)] bg-white py-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
          {options.map((opt) => {
            const isSelected = opt === value;
            return (
              <div
                key={opt}
                className={`relative flex cursor-pointer select-none items-center py-2.5 pl-10 pr-4 text-[14px] transition-colors ${
                  isSelected
                    ? "bg-[var(--color-accent-50)] text-[var(--color-accent-800)] font-semibold"
                    : "text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
                }`}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
              >
                {isSelected && (
                  <span className="absolute left-3.5 flex items-center text-[var(--color-accent)]">
                    <Check size={16} strokeWidth={3} />
                  </span>
                )}
                <span className="block truncate">{opt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
