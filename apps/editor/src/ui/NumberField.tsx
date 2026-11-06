import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './NumberField.module.css';

export interface NumberFieldProps {
  label?: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  onStartChange?: () => void;
  unit?: string;
  step?: number;
  shiftStep?: number;
  altStep?: number;
  min?: number;
  max?: number;
  precision?: number;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  inputWidth?: number | string;
  id?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

/**
 * Safely evaluates simple arithmetic expressions (+, -, *, /, parentheses,
 * decimals, unary signs, and relative prefixes like +=, -=, *=, /=, +45).
 * Does NOT use eval().
 */
export function evaluateMathExpression(expr: string, baseValue?: number): number | null {
  const clean = expr.trim();
  if (!clean) return null;

  if (baseValue !== undefined) {
    if (
      clean.startsWith('+=') ||
      clean.startsWith('-=') ||
      clean.startsWith('*=') ||
      clean.startsWith('/=')
    ) {
      const op = clean[0];
      const rest = evaluateMathExpression(clean.slice(2));
      if (rest === null) return null;
      if (op === '+') return baseValue + rest;
      if (op === '-') return baseValue - rest;
      if (op === '*') return baseValue * rest;
      if (op === '/') return rest !== 0 ? baseValue / rest : null;
    }
    if (clean.startsWith('*') && clean.length > 1 && !isNaN(Number(clean.slice(1)))) {
      return baseValue * Number(clean.slice(1));
    }
    if (clean.startsWith('/') && clean.length > 1 && !isNaN(Number(clean.slice(1)))) {
      const denom = Number(clean.slice(1));
      return denom !== 0 ? baseValue / denom : null;
    }
    if (clean.startsWith('+') && clean.length > 1 && !isNaN(Number(clean.slice(1)))) {
      return baseValue + Number(clean.slice(1));
    }
  }

  const tokens: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const c = clean[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ('+-*/()'.includes(c)) {
      const prev = tokens[tokens.length - 1];
      const isUnary = (c === '-' || c === '+') && (tokens.length === 0 || '+-*/('.includes(prev));
      if (isUnary) {
        let numStr = c;
        i++;
        while (i < clean.length && /[0-9.]/.test(clean[i])) {
          numStr += clean[i];
          i++;
        }
        if (numStr === '-' || numStr === '+') return null;
        tokens.push(numStr);
        continue;
      } else {
        tokens.push(c);
        i++;
        continue;
      }
    }
    if (/[0-9.]/.test(c)) {
      let numStr = '';
      while (i < clean.length && /[0-9.]/.test(clean[i])) {
        numStr += clean[i];
        i++;
      }
      tokens.push(numStr);
      continue;
    }
    return null;
  }

  if (tokens.length === 0) return null;

  let pos = 0;
  function parseExpr(): number | null {
    let val = parseTerm();
    if (val === null) return null;
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const next = parseTerm();
      if (next === null) return null;
      if (op === '+') val += next;
      else val -= next;
    }
    return val;
  }

  function parseTerm(): number | null {
    let val = parseFactor();
    if (val === null) return null;
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++];
      const next = parseFactor();
      if (next === null) return null;
      if (op === '*') val *= next;
      else {
        if (next === 0) return null;
        val /= next;
      }
    }
    return val;
  }

  function parseFactor(): number | null {
    if (pos >= tokens.length) return null;
    const t = tokens[pos++];
    if (t === '(') {
      const val = parseExpr();
      if (pos >= tokens.length || tokens[pos++] !== ')') return null;
      return val;
    }
    const n = Number(t);
    return isNaN(n) ? null : n;
  }

  const result = parseExpr();
  if (pos !== tokens.length || result === null || !isFinite(result)) return null;
  return result;
}

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  onChange,
  onCommit,
  onStartChange,
  unit,
  step = 1,
  shiftStep = 10,
  altStep = 0.1,
  min,
  max,
  precision,
  ariaLabel,
  disabled = false,
  className,
  inputWidth,
  id,
  style,
  'data-testid': testId,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState<string>(() => {
    if (precision !== undefined) return value.toFixed(precision);
    return String(roundTo(value, 2));
  });

  const committedValueRef = useRef<number>(value);
  const hasChangedRef = useRef<boolean>(false);
  const isEscapingRef = useRef<boolean>(false);
  const isEnterRef = useRef<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync text when external value changes and not actively typing
  useEffect(() => {
    if (!isFocused) {
      committedValueRef.current = value;
      if (precision !== undefined) {
        setText(value.toFixed(precision));
      } else {
        setText(String(roundTo(value, 2)));
      }
    }
  }, [value, isFocused, precision]);

  const commitValue = useCallback(
    (parsedVal: number) => {
      let finalVal = parsedVal;
      if (precision !== undefined) {
        finalVal = roundTo(finalVal, precision);
      } else {
        finalVal = roundTo(finalVal, step < 1 || altStep < 1 ? 2 : 0);
      }
      if (min !== undefined) finalVal = Math.max(min, finalVal);
      if (max !== undefined) finalVal = Math.min(max, finalVal);

      if (!hasChangedRef.current && finalVal !== committedValueRef.current) {
        onStartChange?.();
      }
      committedValueRef.current = finalVal;
      hasChangedRef.current = false;
      setText(precision !== undefined ? finalVal.toFixed(precision) : String(finalVal));
      onChange(finalVal);
      onCommit?.(finalVal);
    },
    [precision, step, altStep, min, max, onStartChange, onChange, onCommit]
  );

  const handleFocus = () => {
    setIsFocused(true);
    committedValueRef.current = value;
    hasChangedRef.current = false;
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (isEscapingRef.current) {
      isEscapingRef.current = false;
      hasChangedRef.current = false;
      return;
    }
    if (isEnterRef.current) {
      isEnterRef.current = false;
      hasChangedRef.current = false;
      return;
    }
    const parsed = evaluateMathExpression(text, committedValueRef.current);
    if (parsed !== null && isFinite(parsed)) {
      commitValue(parsed);
    } else {
      // Revert if invalid
      if (hasChangedRef.current) {
        onChange(committedValueRef.current);
      }
      setText(
        precision !== undefined
          ? committedValueRef.current.toFixed(precision)
          : String(roundTo(committedValueRef.current, 2))
      );
    }
    hasChangedRef.current = false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      let s = step;
      if (e.shiftKey) s = shiftStep;
      else if (e.altKey) s = altStep;

      const sign = e.key === 'ArrowUp' ? 1 : -1;
      const current = evaluateMathExpression(text, committedValueRef.current) ?? value;
      let next = current + sign * s;
      const dec = precision !== undefined ? precision : s < 1 ? 2 : 0;
      next = roundTo(next, dec);
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);

      if (!hasChangedRef.current) {
        onStartChange?.();
        hasChangedRef.current = true;
      }
      setText(precision !== undefined ? next.toFixed(precision) : String(next));
      onChange(next);
      onCommit?.(next);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      isEnterRef.current = true;
      const parsed = evaluateMathExpression(text, committedValueRef.current);
      if (parsed !== null && isFinite(parsed)) {
        commitValue(parsed);
      } else {
        setText(
          precision !== undefined
            ? committedValueRef.current.toFixed(precision)
            : String(roundTo(committedValueRef.current, 2))
        );
      }
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      isEscapingRef.current = true;
      if (hasChangedRef.current) {
        onChange(committedValueRef.current);
      }
      setText(
        precision !== undefined
          ? committedValueRef.current.toFixed(precision)
          : String(roundTo(committedValueRef.current, 2))
      );
      hasChangedRef.current = false;
      inputRef.current?.blur();
      return;
    }
  };

  // Label Scrubbing
  const handleLabelPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    const startX = e.clientX;
    const startVal = value;
    committedValueRef.current = value;
    hasChangedRef.current = false;

    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    let latestVal = startVal;

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      let mult = 1;
      if (moveEv.shiftKey) {
        // Coarse scrubbing
        mult = shiftStep / step;
      } else if (moveEv.altKey) {
        // Fine scrubbing
        mult = altStep / step;
      }

      const delta = dx * step * mult;
      let nextVal = startVal + delta;
      const dec = precision !== undefined ? precision : (step * mult) < 1 ? 2 : 0;
      nextVal = roundTo(nextVal, dec);
      if (min !== undefined) nextVal = Math.max(min, nextVal);
      if (max !== undefined) nextVal = Math.min(max, nextVal);

      latestVal = nextVal;

      if (!hasChangedRef.current && nextVal !== startVal) {
        onStartChange?.();
        hasChangedRef.current = true;
      }

      setText(precision !== undefined ? nextVal.toFixed(precision) : String(nextVal));
      onChange(nextVal);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;

      if (hasChangedRef.current) {
        onCommit?.(latestVal);
        committedValueRef.current = latestVal;
      }
      hasChangedRef.current = false;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const effectiveAriaLabel =
    ariaLabel || (typeof label === 'string' ? label.replace(/:$/, '') : undefined);

  return (
    <div
      className={`${styles.numberField} ${className || ''}`}
      style={style}
      data-testid={testId}
    >
      {label && (
        <span
          className={styles.label}
          onPointerDown={handleLabelPointerDown}
          title="Click and drag horizontally to scrub value (Shift = coarse, Alt = fine)"
          aria-hidden="true"
        >
          {label}
        </span>
      )}
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-label={effectiveAriaLabel}
          disabled={disabled}
          className={styles.input}
          style={{ width: inputWidth }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onWheel={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
    </div>
  );
};
