import { useCallback, useEffect, useState } from "react";

export function useAsyncData(loadData, initialData) {
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const result = await loadData();
      setData(result);
      setStatus("success");
    } catch (requestError) {
      setError(requestError.message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  }, [loadData]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, status, error, reload };
}
