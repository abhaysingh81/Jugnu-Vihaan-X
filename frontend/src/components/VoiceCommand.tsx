import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { aiService, type VoiceCommandResult } from "@/lib/ai.service";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export function VoiceCommand() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize speech recognition
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        return;
      }

      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = "en-US";

      // Set up recognition event handlers
      recognitionRef.current.onstart = () => {
        setIsRecording(true);
        toast({
          title: "Listening...",
          description: "Speak your command clearly",
        });
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        setIsRecording(false);
        setIsProcessing(false);
        toast({
          title: "Error",
          description: "Failed to recognize speech. Please try again.",
          variant: "destructive",
        });
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current.onresult = async (
        event: SpeechRecognitionEvent,
      ) => {
        try {
          const current = event.resultIndex;
          const result = event.results[current];
          const transcriptText = result[0].transcript;

          if (result.isFinal && transcriptText.trim()) {
            setTranscript(transcriptText);
            setIsProcessing(true);
            const response = await aiService.processVoiceCommand(
              transcriptText,
            );

            if (response) {
              handleCommandResult(response);
            } else {
              throw new Error("Empty response from server");
            }
          }
        } catch (error) {
          console.error("Voice command processing failed:", {
            error: error instanceof Error ? error.message : "Unknown error",
          });
          setError(
            error instanceof Error
              ? error.message
              : "Failed to process voice command",
          );
        } finally {
          setIsProcessing(false);
        }
      };

      recognitionRef.current.onspeechstart = () => {
        console.log("Speech started");
        toast({
          title: "Speech Detected",
          description: "Processing your voice...",
        });
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleCommandResult = (result: VoiceCommandResult) => {
    toast({
      title: "Command Processed",
      description: result.response_message,
    });

    // Emit custom event for different command types
    const event = new CustomEvent("voiceCommand", {
      detail: {
        type: result.command_type,
        parameters: result.parameters,
      },
    });
    window.dispatchEvent(event);
  };

  const startRecording = () => {
    setError(null);
    if (!recognitionRef.current) {
      toast({
        title: "Error",
        description: "Speech recognition not supported in your browser.",
        variant: "destructive",
      });
      return;
    }

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error("Failed to start recording:", error);
      toast({
        title: "Error",
        description: "Could not start voice recognition. Please try again.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error("Failed to stop recording:", error);
      }
    }
    setIsRecording(false);
  };

  return (
    <div className="relative group">
      <div className="relative flex items-center gap-2">
        <Button
          variant={isRecording ? "destructive" : "default"}
          size="icon"
          aria-label={isRecording ? "Stop voice command" : "Start voice command"}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className="relative z-10"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isRecording ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        {isRecording && (
          <div className="absolute left-12 min-w-[200px] max-w-[500px]">
            <Card className="p-2 shadow-lg border-primary/20">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <p className="text-sm truncate">
                  {transcript || "Listening..."}
                </p>
              </div>
            </Card>
          </div>
        )}
      </div>

      {error && <p role="status" className="text-sm text-muted-foreground">{error}</p>}

      {isRecording && !transcript && (
        <div className="absolute -bottom-8 right-0 whitespace-nowrap">
          <Alert variant="default" className="py-1">
            <AlertDescription className="text-xs">
              Speak your command...
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
