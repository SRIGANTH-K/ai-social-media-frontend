import { useRef, useState, type ChangeEvent } from "react";
import "./App.css";

/*
 * ============================================================
 * AWS API CONFIGURATION
 * ============================================================
 */

// AI post generation API
const API_URL =
  "https://9bd3e5wwxb.execute-api.us-east-1.amazonaws.com/generate";

// Image upload API
const UPLOAD_API_URL =
  "https://9bd3e5wwxb.execute-api.us-east-1.amazonaws.com/upload";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

type ApiResponse = {
  success: boolean;
  content?: string;
  hashtags?: string[];
  platform?: string;
  tone?: string;
  hasImage?: boolean;
  bucket?: string;
  key?: string;
  imageContentType?: string;
  model?: string;
  error?: string;
};

type UploadResponse = {
  uploadUrl: string;
  key: string;
};

/*
 * ============================================================
 * IMAGE CONVERSION
 * ============================================================
 *
 * Converts every selected image into a REAL PNG before upload.
 *
 * This prevents errors where:
 *
 * example.png
 *
 * actually contains JPEG binary data.
 *
 * The backend always receives:
 *
 * Content-Type: image/png
 * Actual binary data: PNG
 *
 * ============================================================
 */

async function convertImageToPng(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext("2d");

        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Unable to process the selected image."));
          return;
        }

        context.drawImage(
          image,
          0,
          0,
          image.naturalWidth,
          image.naturalHeight
        );

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);

            if (!blob) {
              reject(new Error("Unable to convert the image to PNG."));
              return;
            }

            resolve(blob);
          },
          "image/png"
        );
      } catch (error) {
        URL.revokeObjectURL(objectUrl);

        reject(
          error instanceof Error
            ? error
            : new Error("Unable to convert the image to PNG.")
        );
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);

      reject(
        new Error(
          "The selected image could not be read. Please choose another image."
        )
      );
    };

    image.src = objectUrl;
  });
}

/*
 * ============================================================
 * APP
 * ============================================================
 */

function App() {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("LinkedIn");
  const [tone, setTone] = useState("Professional");

  // Internal reference used by the backend
  const [imageKey, setImageKey] = useState("");

  // Original filename shown to user
  const [uploadedFileName, setUploadedFileName] = useState("");

  // Local browser preview
  const [imagePreview, setImagePreview] = useState("");

  const [content, setContent] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
   * ==========================================================
   * HANDLE IMAGE UPLOAD
   * ==========================================================
   */

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setUploadProgress(0);

    /*
     * Validate file
     */

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      event.target.value = "";
      return;
    }

    /*
     * Maximum original size: 5 MB
     */

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      setError("Image size must be less than 5 MB.");
      event.target.value = "";
      return;
    }

    /*
     * Create local preview immediately
     */

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    setUploading(true);

    try {
      /*
       * --------------------------------------------------------
       * STEP 1
       * Convert selected image to REAL PNG
       * --------------------------------------------------------
       */

      setUploadProgress(15);

      const pngBlob = await convertImageToPng(file);

      /*
       * Check converted PNG size
       */

      if (pngBlob.size > maxSize) {
        throw new Error(
          "The converted PNG image is larger than 5 MB. Please choose a smaller image."
        );
      }

      setUploadProgress(35);

      /*
       * --------------------------------------------------------
       * STEP 2
       * Create PNG filename
       * --------------------------------------------------------
       */

      const originalNameWithoutExtension = file.name.replace(
        /\.[^/.]+$/,
        ""
      );

      const pngFileName = `${originalNameWithoutExtension}.png`;

      /*
       * --------------------------------------------------------
       * STEP 3
       * Request presigned upload URL
       * --------------------------------------------------------
       */

      const presignedResponse = await fetch(UPLOAD_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: pngFileName,
          contentType: "image/png",
        }),
      });

      const rawResponse = await presignedResponse.json();

      let uploadData: UploadResponse & {
        error?: string;
        message?: string;
      };

      if (typeof rawResponse.body === "string") {
        try {
          uploadData = JSON.parse(rawResponse.body);
        } catch {
          uploadData = {
            uploadUrl: "",
            key: "",
            error: "Invalid response from upload service.",
          };
        }
      } else if (rawResponse.body) {
        uploadData = rawResponse.body;
      } else {
        uploadData = rawResponse;
      }

      if (!presignedResponse.ok) {
        throw new Error(
          uploadData?.error ||
            uploadData?.message ||
            "Failed to prepare the image upload."
        );
      }

      if (!uploadData.uploadUrl || !uploadData.key) {
        throw new Error(
          "The upload service did not return a valid upload URL."
        );
      }

      setUploadProgress(60);

      /*
       * --------------------------------------------------------
       * STEP 4
       * Upload REAL PNG
       * --------------------------------------------------------
       */

      const uploadResponse = await fetch(uploadData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "image/png",
        },
        body: pngBlob,
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `Image upload failed with status ${uploadResponse.status}.`
        );
      }

      setUploadProgress(90);

      /*
       * --------------------------------------------------------
       * STEP 5
       * Store internal image key
       * --------------------------------------------------------
       */

      setImageKey(uploadData.key);
      setUploadedFileName(file.name);
      setUploadProgress(100);

      console.log("Image uploaded successfully.");
    } catch (err) {
      console.error("Image upload error:", err);

      if (err instanceof Error) {
        setError(`Image upload failed: ${err.message}`);
      } else {
        setError("Image upload failed. Please try again.");
      }

      setImageKey("");
      setUploadedFileName("");
      setUploadProgress(0);

      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }

      setImagePreview("");
    } finally {
      setUploading(false);

      /*
       * Allow same file to be selected again.
       */

      event.target.value = "";
    }
  }

  /*
   * ==========================================================
   * OPEN FILE PICKER
   * ==========================================================
   */

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  /*
   * ==========================================================
   * GENERATE POST
   * ==========================================================
   */

  async function generatePost() {
    setError("");
    setContent("");
    setHashtags([]);
    setCopied(false);

    /*
     * Topic OR image is required.
     */

    if (!topic.trim() && !imageKey.trim()) {
      setError("Please enter a topic or upload an image.");
      return;
    }

    /*
     * Don't generate while upload is running.
     */

    if (uploading) {
      setError("Please wait until the image upload is complete.");
      return;
    }

    setLoading(true);

    try {
      /*
       * Build request
       */

      const requestBody: {
        topic?: string;
        platform: string;
        tone: string;
        imageKey?: string;
      } = {
        platform,
        tone,
      };

      if (topic.trim()) {
        requestBody.topic = topic.trim();
      }

      if (imageKey.trim()) {
        requestBody.imageKey = imageKey.trim();
      }

      /*
       * Call generation API
       */

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const rawResponse = await response.json();

      let data: ApiResponse;

      if (typeof rawResponse.body === "string") {
        try {
          data = JSON.parse(rawResponse.body);
        } catch {
          data = {
            success: false,
            error: "Invalid response received from the AI service.",
          };
        }
      } else if (rawResponse.body) {
        data = rawResponse.body;
      } else {
        data = rawResponse;
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to generate the post."
        );
      }

      setContent(data.content || "");
      setHashtags(data.hashtags || []);
    } catch (err) {
      console.error("Generate post error:", err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  /*
   * ==========================================================
   * COPY POST
   * ==========================================================
   */

  async function copyPost() {
    const fullText = `${content}\n\n${hashtags.join(" ")}`;

    try {
      await navigator.clipboard.writeText(fullText);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setError("Unable to copy the generated post.");
    }
  }

  /*
   * ==========================================================
   * REMOVE IMAGE
   * ==========================================================
   */

  function removeImage() {
    setImageKey("");
    setUploadedFileName("");
    setUploadProgress(0);
    setError("");

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImagePreview("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  /*
   * ==========================================================
   * CLEAR ALL
   * ==========================================================
   */

  function clearAll() {
    setTopic("");
    setPlatform("LinkedIn");
    setTone("Professional");

    setImageKey("");
    setUploadedFileName("");
    setUploadProgress(0);

    setContent("");
    setHashtags([]);

    setError("");
    setCopied(false);

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImagePreview("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  /*
   * ==========================================================
   * UI
   * ==========================================================
   */

  return (
    <div className="app">

      {/* ======================================================
          BACKGROUND
          ====================================================== */}

      <div className="background-effects">
        <div className="ambient ambient-one"></div>
        <div className="ambient ambient-two"></div>
        <div className="ambient ambient-three"></div>

        <div className="orb orb-one"></div>
        <div className="orb orb-two"></div>
        <div className="orb orb-three"></div>

        <div className="grid-overlay"></div>
      </div>

      {/* ======================================================
          HEADER
          ====================================================== */}

      <header className="header">

        <div className="brand">

          <div className="brand-icon">
            <span>✦</span>
          </div>

          <div className="brand-text">
            <h1>AI Social</h1>
            <span>Media Generator</span>
          </div>

        </div>

        <div className="header-center">
          <div className="nav-pill">
            <span className="nav-active">Create</span>
            <span>AI Studio</span>
            <span>About</span>
          </div>
        </div>

        <div className="header-right">

          <div className="status">
            <span className="status-dot"></span>
            <span>AI Powered</span>
          </div>

        </div>

      </header>

      {/* ======================================================
          MAIN
          ====================================================== */}

      <main className="container">

        {/* ====================================================
            HERO
            ==================================================== */}

        <section className="hero">

          <div className="hero-badge">
            <span className="badge-glow"></span>
            AI CONTENT ENGINE
          </div>

          <h2>
            Turn your ideas into
            <span className="hero-gradient">
              {" "}content that stands out.
            </span>
          </h2>

          <p>
            Create polished social media posts with intelligent
            AI generation, image understanding and platform-aware
            writing.
          </p>

          <div className="hero-orbit">

            <div className="orbit-ring orbit-ring-one"></div>
            <div className="orbit-ring orbit-ring-two"></div>

            <div className="orbit-core">
              <span>✦</span>
            </div>

            <div className="orbit-particle particle-one"></div>
            <div className="orbit-particle particle-two"></div>
            <div className="orbit-particle particle-three"></div>

          </div>

        </section>

        {/* ====================================================
            WORKSPACE
            ==================================================== */}

        <section className="workspace">

          {/* ==================================================
              CREATE PANEL
              ================================================== */}

          <section className="glass-card generator-card">

            <div className="card-glow"></div>

            <div className="card-header">

              <div>

                <div className="section-label">
                  <span>01</span>
                  CREATE
                </div>

                <h3>Build your post</h3>

                <p>
                  Give the AI an idea and let it do the rest.
                </p>

              </div>

              <div className="card-icon">
                ✦
              </div>

            </div>

            {/* =================================================
                TOPIC
                ================================================= */}

            <div className="field">

              <label htmlFor="topic">
                <span>What do you want to say?</span>

                <span className="optional">
                  Optional with image
                </span>
              </label>

              <div className="input-shell textarea-shell">

                <textarea
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Tell the AI what you want to post about..."
                  rows={5}
                  disabled={loading}
                />

                <div className="input-corner">
                  ✦
                </div>

              </div>

            </div>

            {/* =================================================
                PLATFORM + TONE
                ================================================= */}

            <div className="select-grid">

              <div className="field">

                <label htmlFor="platform">
                  Platform
                </label>

                <div className="input-shell">

                  <select
                    id="platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    disabled={loading}
                  >
                    <option value="LinkedIn">
                      LinkedIn
                    </option>

                    <option value="Instagram">
                      Instagram
                    </option>

                    <option value="Facebook">
                      Facebook
                    </option>

                    <option value="X">
                      X / Twitter
                    </option>
                  </select>

                  <span className="select-arrow">
                    ↓
                  </span>

                </div>

              </div>

              <div className="field">

                <label htmlFor="tone">
                  Tone
                </label>

                <div className="input-shell">

                  <select
                    id="tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    disabled={loading}
                  >
                    <option value="Professional">
                      Professional
                    </option>

                    <option value="Friendly">
                      Friendly
                    </option>

                    <option value="Casual">
                      Casual
                    </option>

                    <option value="Inspirational">
                      Inspirational
                    </option>

                    <option value="Confident">
                      Confident
                    </option>
                  </select>

                  <span className="select-arrow">
                    ↓
                  </span>

                </div>

              </div>

            </div>

            {/* =================================================
                IMAGE
                ================================================= */}

            <div className="field">

              <label>

                <span>Visual reference</span>

                <span className="optional">
                  Optional
                </span>

              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageUpload}
                className="file-input"
              />

              {!uploadedFileName ? (

                <button
                  type="button"
                  className="upload-zone"
                  onClick={openFilePicker}
                  disabled={uploading || loading}
                >

                  <div className="upload-icon">
                    {uploading ? (
                      <span className="upload-spinner"></span>
                    ) : (
                      "↑"
                    )}
                  </div>

                  <div className="upload-copy">

                    <strong>
                      {uploading
                        ? `Uploading ${uploadProgress}%`
                        : "Drop your image here"}
                    </strong>

                    <span>
                      {uploading
                        ? "Preparing your visual..."
                        : "or click to browse from your device"}
                    </span>

                  </div>

                  {!uploading && (
                    <span className="upload-plus">
                      +
                    </span>
                  )}

                </button>

              ) : (

                <div className="uploaded-image-box">

                  <div className="uploaded-preview">

                    {imagePreview && (
                      <img
                        src={imagePreview}
                        alt="Selected preview"
                      />
                    )}

                    <div className="preview-check">
                      ✓
                    </div>

                  </div>

                  <div className="uploaded-image-info">

                    <strong>
                      {uploadedFileName}
                    </strong>

                    <span>
                      Image ready
                    </span>

                  </div>

                  <button
                    type="button"
                    className="remove-image-button"
                    onClick={removeImage}
                    disabled={loading}
                    aria-label="Remove image"
                  >
                    ×
                  </button>

                </div>

              )}

              <small className="upload-help">
                JPG, PNG, WEBP or GIF · Maximum 5 MB
              </small>

            </div>

            {/* =================================================
                ERROR
                ================================================= */}

            {error && (

              <div className="error-box">

                <div className="error-icon">
                  !
                </div>

                <p>
                  {error}
                </p>

              </div>

            )}

            {/* =================================================
                ACTIONS
                ================================================= */}

            <div className="actions">

              <button
                className="generate-button"
                onClick={generatePost}
                disabled={loading || uploading}
              >

                <span className="button-shine"></span>

                {loading ? (

                  <>
                    <span className="spinner"></span>
                    Creating magic...
                  </>

                ) : (

                  <>
                    <span>✦</span>
                    Generate Post
                    <span className="button-arrow">
                      →
                    </span>
                  </>

                )}

              </button>

              <button
                className="clear-button"
                onClick={clearAll}
                disabled={loading || uploading}
              >
                Clear
              </button>

            </div>

            {/* =================================================
                TECH FOOTER
                ================================================= */}

            <div className="mini-tech">

              <span>
                <i></i>
                AI Engine
              </span>

              <span>
                <i></i>
                Image Vision
              </span>

              <span>
                <i></i>
                Secure Processing
              </span>

            </div>

          </section>

          {/* ==================================================
              RESULT PANEL
              ================================================== */}

          <section className="glass-card result-card">

            <div className="result-background-orb"></div>

            <div className="card-header">

              <div>

                <div className="section-label">
                  <span>02</span>
                  AI OUTPUT
                </div>

                <h3>Your content</h3>

                <p>
                  Your generated post will appear here.
                </p>

              </div>

              {content && (

                <button
                  className="copy-button"
                  onClick={copyPost}
                >
                  {copied ? "✓ Copied" : "Copy"}
                </button>

              )}

            </div>

            {/* =================================================
                EMPTY
                ================================================= */}

            {!content && !loading && (

              <div className="empty-state">

                <div className="empty-visual">

                  <div className="empty-orbit orbit-a"></div>
                  <div className="empty-orbit orbit-b"></div>

                  <div className="empty-core">
                    ✦
                  </div>

                  <span className="floating-star star-a">
                    ✦
                  </span>

                  <span className="floating-star star-b">
                    ·
                  </span>

                  <span className="floating-star star-c">
                    ✦
                  </span>

                </div>

                <h4>
                  Your next post starts here.
                </h4>

                <p>
                  Add a topic or image, select your platform
                  and tone, then let the AI create something
                  worth sharing.
                </p>

                <div className="empty-hint">
                  <span>✦</span>
                  Ready when you are
                </div>

              </div>

            )}

            {/* =================================================
                LOADING
                ================================================= */}

            {loading && (

              <div className="loading-state">

                <div className="ai-loader">

                  <div className="loader-ring ring-one"></div>
                  <div className="loader-ring ring-two"></div>

                  <div className="loader-core">
                    ✦
                  </div>

                </div>

                <h4>
                  Creating your post
                </h4>

                <p>
                  Your AI content engine is working on
                  something polished for you.
                </p>

                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>

              </div>

            )}

            {/* =================================================
                RESULT
                ================================================= */}

            {content && !loading && (

              <div className="result-content">

                <div className="post-meta">

                  <span className="meta-platform">
                    <i></i>
                    {platform}
                  </span>

                  <span>
                    {tone}
                  </span>

                  {imageKey && (
                    <span>
                      Image included
                    </span>
                  )}

                </div>

                <div className="post-output">

                  <div className="output-top">

                    <div className="output-avatar">
                      ✦
                    </div>

                    <div>

                      <strong>
                        AI Social Media
                      </strong>

                      <span>
                        Generated content
                      </span>

                    </div>

                    <div className="output-more">
                      •••
                    </div>

                  </div>

                  <div className="post-text">
                    {content}
                  </div>

                  {hashtags.length > 0 && (

                    <div className="hashtags-section">

                      <h4>
                        Suggested tags
                      </h4>

                      <div className="hashtags">

                        {hashtags.map(
                          (hashtag, index) => (

                            <span
                              key={`${hashtag}-${index}`}
                              className="hashtag"
                            >
                              {hashtag}
                            </span>

                          )
                        )}

                      </div>

                    </div>

                  )}

                </div>

                <button
                  className="copy-full-button"
                  onClick={copyPost}
                >

                  <span>
                    {copied
                      ? "✓ Copied to clipboard"
                      : "Copy Post & Hashtags"}
                  </span>

                  {!copied && (
                    <span>
                      ⧉
                    </span>
                  )}

                </button>

              </div>

            )}

          </section>

        </section>

        {/* ====================================================
            ARCHITECTURE
            ==================================================== */}

        <section className="architecture">

          <div className="architecture-line"></div>

          <div className="architecture-title">
            POWERED BY
          </div>

          <div className="architecture-items">

            <span className="tech-chip">
              <b>R</b>
              React
            </span>

            <span className="architecture-arrow">
              →
            </span>

            <span className="tech-chip">
              <b>A</b>
              AWS
            </span>

            <span className="architecture-arrow">
              →
            </span>

            <span className="tech-chip">
              <b>λ</b>
              Lambda
            </span>

            <span className="architecture-arrow">
              →
            </span>

            <span className="tech-chip">
              <b>✦</b>
              Bedrock
            </span>

          </div>

        </section>

      </main>

      {/* ======================================================
          FOOTER
          ====================================================== */}

      <footer>

        <div className="footer-inner">

          <div>
            <span className="footer-logo">
              ✦
            </span>

            <strong>
              AI Social Media Generator
            </strong>
          </div>

          <span>
            Built with React + AWS
          </span>

        </div>

      </footer>

    </div>
  );
}

export default App;
