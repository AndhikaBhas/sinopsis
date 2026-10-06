export default function Settings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>
      <div className="rounded-lg border border-border p-8">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Application Settings</h3>
            <p className="text-sm text-muted-foreground">
              Configure your application preferences and account settings.
            </p>
          </div>
          <div className="pt-4">
            <p className="text-muted-foreground">Settings options will be available here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
