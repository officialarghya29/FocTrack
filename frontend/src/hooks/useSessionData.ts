import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import type { Session } from "../types";

export function useActiveSession() {
  return useQuery({
    queryKey: ["session", "active"],
    queryFn: api.activeSession,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

export function useSessionMutations(sessionId?: number) {
  const queryClient = useQueryClient();
  const { notify, errorMessage } = useApp();

  const sync = (session: Session) => {
    queryClient.setQueryData(["session", "active"], session);
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["sessions"] });
  };

  const clear = () => {
    queryClient.setQueryData(["session", "active"], null);
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["sessions"] });
  };

  const base = {
    onError: (error: unknown) => notify(errorMessage(error), "error"),
  };

  const pause = useMutation({
    mutationFn: () => api.pauseSession(sessionId!),
    onSuccess: (data) => {
      sync(data.session);
      notify(data.message, "info");
    },
    ...base,
  });

  const resume = useMutation({
    mutationFn: () => api.resumeSession(sessionId!),
    onSuccess: (data) => {
      sync(data.session);
      notify(data.message, "info");
    },
    ...base,
  });

  const complete = useMutation({
    mutationFn: () => api.completeSession(sessionId!),
    onSuccess: (data) => {
      sync(data.session);
      notify(data.message, "success");
    },
    ...base,
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelSession(sessionId!),
    onSuccess: (data) => {
      clear();
      notify(data.message, "info");
    },
    ...base,
  });

  const addInterruption = useMutation({
    mutationFn: (payload: { reason: string; customReason?: string; notes?: string }) =>
      api.addInterruption(sessionId!, payload),
    onSuccess: (session) => {
      sync(session);
      notify("Interruption logged.", "info");
    },
    ...base,
  });

  const endInterruption = useMutation({
    mutationFn: (id: number) => api.endInterruption(id),
    onSuccess: (session) => sync(session),
    ...base,
  });

  const deleteInterruption = useMutation({
    mutationFn: (id: number) => api.deleteInterruption(id),
    onSuccess: (session) => sync(session),
    ...base,
  });

  return {
    pause,
    resume,
    complete,
    cancel,
    addInterruption,
    endInterruption,
    deleteInterruption,
  };
}
