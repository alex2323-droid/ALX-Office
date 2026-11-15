import { useCallback, useEffect, useRef, useState } from 'react';

interface HistoryStack<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface UseDocumentHistoryOptions<T> {
  maxSteps?: number;
  debounceMs?: number;
  equals?: (a: T, b: T) => boolean;
}

export function useDocumentHistory<T>(
  initialValue: T,
  resetKey: string,
  options?: UseDocumentHistoryOptions<T>,
) {
  const maxSteps = options?.maxSteps ?? 60;
  const debounceMs = options?.debounceMs ?? 450;
  const equalsRef = useRef(options?.equals);
  equalsRef.current = options?.equals;

  const isEqual = useCallback((a: T, b: T) => {
    if (Object.is(a, b)) return true;
    if (equalsRef.current) return equalsRef.current(a, b);
    return false;
  }, []);

  const [history, setHistory] = useState<HistoryStack<T>>(() => ({
    past: [],
    present: initialValue,
    future: [],
  }));

  const historyRef = useRef<HistoryStack<T>>(history);
  historyRef.current = history;

  const burstActiveRef = useRef(false);
  const burstTimerRef = useRef<number | null>(null);
  const resetKeyRef = useRef(resetKey);

  const clearBurstTimer = useCallback(() => {
    if (burstTimerRef.current !== null) {
      window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
  }, []);

  const commitPending = useCallback(() => {
    clearBurstTimer();
    burstActiveRef.current = false;
  }, [clearBurstTimer]);

  // Reset history stack cleanly when switching documents
  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      clearBurstTimer();
      burstActiveRef.current = false;
      const next: HistoryStack<T> = {
        past: [],
        present: initialValue,
        future: [],
      };
      historyRef.current = next;
      setHistory(next);
    }
  }, [resetKey, initialValue, clearBurstTimer]);

  useEffect(() => {
    return () => {
      clearBurstTimer();
    };
  }, [clearBurstTimer]);

  const pushImmediate = useCallback(
    (nextValue: T) => {
      commitPending();
      const prev = historyRef.current;
      if (isEqual(prev.present, nextValue)) return;
      const nextPast = [...prev.past, prev.present];
      if (nextPast.length > maxSteps) {
        nextPast.splice(0, nextPast.length - maxSteps);
      }
      const next: HistoryStack<T> = {
        past: nextPast,
        present: nextValue,
        future: [],
      };
      historyRef.current = next;
      setHistory(next);
    },
    [commitPending, isEqual, maxSteps],
  );

  const recordDebounced = useCallback(
    (nextValue: T) => {
      const prev = historyRef.current;
      if (isEqual(prev.present, nextValue)) return;

      let nextPast = prev.past;
      if (!burstActiveRef.current) {
        nextPast = [...prev.past, prev.present];
        if (nextPast.length > maxSteps) {
          nextPast.splice(0, nextPast.length - maxSteps);
        }
        burstActiveRef.current = true;
      }

      const next: HistoryStack<T> = {
        past: nextPast,
        present: nextValue,
        future: [],
      };
      historyRef.current = next;
      setHistory(next);

      clearBurstTimer();
      burstTimerRef.current = window.setTimeout(() => {
        burstTimerRef.current = null;
        burstActiveRef.current = false;
      }, debounceMs);
    },
    [clearBurstTimer, debounceMs, isEqual, maxSteps],
  );

  const syncExternal = useCallback(
    (externalValue: T) => {
      const prev = historyRef.current;
      if (isEqual(prev.present, externalValue)) return;
      const next: HistoryStack<T> = {
        ...prev,
        present: externalValue,
      };
      historyRef.current = next;
      setHistory(next);
    },
    [isEqual],
  );

  const undo = useCallback((): T | null => {
    commitPending();
    const prev = historyRef.current;
    if (prev.past.length === 0) return null;
    const target = prev.past[prev.past.length - 1];
    const nextPast = prev.past.slice(0, -1);
    const nextFuture = [prev.present, ...prev.future].slice(0, maxSteps);
    const next: HistoryStack<T> = {
      past: nextPast,
      present: target,
      future: nextFuture,
    };
    historyRef.current = next;
    setHistory(next);
    return target;
  }, [commitPending, maxSteps]);

  const redo = useCallback((): T | null => {
    commitPending();
    const prev = historyRef.current;
    if (prev.future.length === 0) return null;
    const target = prev.future[0];
    const nextPast = [...prev.past, prev.present];
    if (nextPast.length > maxSteps) {
      nextPast.splice(0, nextPast.length - maxSteps);
    }
    const nextFuture = prev.future.slice(1);
    const next: HistoryStack<T> = {
      past: nextPast,
      present: target,
      future: nextFuture,
    };
    historyRef.current = next;
    setHistory(next);
    return target;
  }, [commitPending, maxSteps]);

  return {
    present: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    pushImmediate,
    recordDebounced,
    commitPending,
    syncExternal,
    undo,
    redo,
  };
}
