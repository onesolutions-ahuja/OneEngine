const EXECUTABLE_INTERACTION_TYPES = new Set(["workflow", "action"]);

export function getPageInteraction(node) {
  return node?.interaction || {};
}

export async function executePageInteraction({
  node,
  record = null,
  navigationContext = null,
  resolveNavigationTarget,
  navigate,
  openForm,
  request,
  onError,
  onBusyChange,
}) {
  const interaction = getPageInteraction(node);
  const type = interaction.type || "none";

  if (type === "none" || type === "component") return { handled: false, type };

  if (type === "navigate") {
    const resolved = interaction.navigationTarget && resolveNavigationTarget
      ? resolveNavigationTarget(interaction.navigationTarget, {
          ...(navigationContext || {}),
          currentRecordId: record?.id || record?.record_id || null,
        })
      : null;
    const route = resolved?.ok ? resolved.route : (interaction.navigateTo?.startsWith("/") ? interaction.navigateTo : null);
    if (route) {
      navigate?.(route);
      return { handled: true, type, route };
    }
    const message = resolved?.message || "This navigation target is no longer available.";
    onError?.(message);
    return { handled: true, type, error: message };
  }

  if (type === "form_layout") {
    if (!interaction.formLayoutId) {
      const message = "This form layout is no longer available.";
      onError?.(message);
      return { handled: true, type, error: message };
    }
    const formAction = {
      layoutId: interaction.formLayoutId,
      presentation: interaction.formPresentation || "screen_modal",
      record,
    };
    openForm?.(formAction);
    return { handled: true, type, formAction };
  }

  if (!EXECUTABLE_INTERACTION_TYPES.has(type)) return { handled: false, type };

  try {
    onBusyChange?.(true);
    onError?.("");
    const objectKey = node?.collection?.objectKey || null;
    const response = await request("/api/platform/runtime/page-interactions/execute", {
      method: "POST",
      body: JSON.stringify({ ...interaction, objectKey, recordId: record?.id || null }),
    });
    if (!response?.success) throw new Error(response?.message || "Unable to execute page action");
    return { handled: true, type, response };
  } catch (error) {
    const message = error?.message || "Unable to execute page action";
    onError?.(message);
    return { handled: true, type, error: message };
  } finally {
    onBusyChange?.(false);
  }
}
