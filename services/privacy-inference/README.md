# Local OPF inference bridge

This bridge is an optional PF-1 runtime dependency. The application never downloads a model at request time. Configure an explicitly provisioned local checkpoint with `HIPASS_PRIVACY_MODEL_PATH` and a dedicated Python environment with `HIPASS_PRIVACY_PYTHON`.

The package revision is pinned in `requirements.lock`. Installing dependencies and obtaining the OpenAI Privacy Filter checkpoint are deliberate operator actions and require an approved networked environment. Request text is passed over stdin, stderr is suppressed by the Node adapter, and the bridge returns only typed spans plus non-sensitive revision metadata.

Readiness fails closed with `MODEL_UNAVAILABLE` when the checkpoint, dependency, or runtime cannot be loaded. This development integration is not a clinical deployment claim.
