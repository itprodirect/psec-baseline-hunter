import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload</h1>
        <p className="text-muted-foreground">
          Ingest baselinekit scan results for analysis
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Baseline ZIP
          </CardTitle>
          <CardDescription>
            Drag and drop a baselinekit ZIP file or click to browse
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50">
            <div className="text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Drop ZIP file here or click to upload
              </p>
              <p className="text-xs text-muted-foreground">
                Supports baselinekit scan exports (max 500MB)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detected Runs</CardTitle>
          <CardDescription>
            Runs will appear here after uploading and processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No runs detected yet. Upload a baselinekit ZIP to get started.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
