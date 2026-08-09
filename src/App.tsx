import { useRef, useState } from "react";
import "./App.css";

/*
 * ============================================================
 * AWS API CONFIGURATION
 * ============================================================
 */

// Existing AI post generation API
const API_URL =
  "https://9bd3e5wwxb.execute-api.us-east-1.amazonaws.com/generate";

// New image upload API
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
 * APP
 * ============================================================
 */

function App() {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("LinkedIn");
  const [tone, setTone] = useState("Professional");

  /*
   * This is automatically populated after the image
   * is successfully uploaded to S3.
   */
  const [imageKey, setImageKey] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");

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
   *
   * Flow:
   *
   * React
   *   ↓
   * POST /upload
   *   ↓
   * API Gateway
   *   ↓
   * Lambda: ai-social-media-upload
   *   ↓
   * Presigned S3 URL
   *   ↓
   * React PUT image
   *   ↓
   * S3
   *
   */

  async function handleImageUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setUploadProgress(0);

    /*
     * --------------------------------------------------------
     * Validate file type
     * --------------------------------------------------------
     */

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      event.target.value = "";
      return;
    }

    /*
     * --------------------------------------------------------
     * Validate file size
     * --------------------------------------------------------
     */

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      setError("Image size must be less than 5 MB.");
      event.target.value = "";
      return;
    }

    setUploading(true);

    try {
      /*
       * ------------------------------------------------------
       * STEP 1
       * Ask Lambda for a presigned S3 upload URL
       * ------------------------------------------------------
       */

      const presignedResponse = await fetch(UPLOAD_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
        }),
      });

      /*
       * Try to parse the API Gateway response.
       *
       * Lambda proxy integration normally returns:
       *
       * {
       *   statusCode: 200,
       *   body: "{\"uploadUrl\":\"...\",\"key\":\"...\"}"
       * }
       */

      const rawResponse = await presignedResponse.json();

      let uploadData: UploadResponse;

      if (typeof rawResponse.body === "string") {
        uploadData = JSON.parse(rawResponse.body);
      } else if (rawResponse.body) {
        uploadData = rawResponse.body;
      } else {
        uploadData = rawResponse;
      }

      if (!presignedResponse.ok) {
        throw new Error(
          uploadData?.key ||
            "Failed to generate the S3 upload URL."
        );
      }

      if (!uploadData.uploadUrl || !uploadData.key) {
        throw new Error(
          "The upload API did not return a valid S3 upload URL."
        );
      }

      /*
       * ------------------------------------------------------
       * STEP 2
       * Upload the actual image directly to S3
       * using the presigned URL.
       * ------------------------------------------------------
       */

      const uploadResponse = await fetch(uploadData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `S3 upload failed with status ${uploadResponse.status}.`
        );
      }

      /*
       * ------------------------------------------------------
       * STEP 3
       * Save the generated S3 key.
       * ------------------------------------------------------
       */

      setImageKey(uploadData.key);
      setUploadedFileName(file.name);
      setUploadProgress(100);

      console.log("Image uploaded successfully.");
      console.log("S3 key:", uploadData.key);
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
    } finally {
      setUploading(false);

      /*
       * Allows the user to select the same file again.
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
     * User must provide either:
     *
     * Topic
     * OR
     * Image
     */

    if (!topic.trim() && !imageKey.trim()) {
      setError("Please enter a topic or upload an image.");
      return;
    }

    /*
     * Don't allow generation while image is still uploading.
     */

    if (uploading) {
      setError("Please wait until the image upload is complete.");
      return;
    }

    setLoading(true);

    try {
      /*
       * ------------------------------------------------------
       * Build request for existing /generate API
       * ------------------------------------------------------
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

      /*
       * The user NEVER types the S3 key.
       *
       * It was automatically generated by the upload Lambda.
       */

      if (imageKey.trim()) {
        requestBody.imageKey = imageKey.trim();
      }

      console.log(
        "Sending request to API Gateway:",
        requestBody
      );

      /*
       * ------------------------------------------------------
       * Call AI generation API
       * ------------------------------------------------------
       */

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to generate the post."
        );
      }

      /*
       * ------------------------------------------------------
       * Display generated content
       * ------------------------------------------------------
       */

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
      {/* =====================================================
          HEADER
          ===================================================== */}

      <header className="header">
        <div className="brand">
          <div className="brand-icon">✦</div>

          <div>
            <h1>AI Social Media Generator</h1>
            <p>
              Create professional social media content with AI
            </p>
          </div>
        </div>

        <div className="header-right">
          <div className="status">
            <span className="status-dot"></span>
            AI Powered
          </div>
        </div>
      </header>

      {/* =====================================================
          MAIN
          ===================================================== */}

      <main className="container">
        {/* ===================================================
            HERO
            =================================================== */}

        <section className="hero">
          <span className="hero-badge">
            AWS • Amazon Bedrock
          </span>

          <h2>
            Turn your ideas into
            <span> engaging posts.</span>
          </h2>

          <p>
            Generate polished social media content using
            Amazon Nova 2 Lite.
          </p>
        </section>

        {/* ===================================================
            WORKSPACE
            =================================================== */}

        <div className="workspace">
          {/* =================================================
              GENERATOR CARD
              ================================================= */}

          <section className="card generator-card">
            <div className="card-header">
              <div>
                <h3>Create your post</h3>
                <p>
                  Tell the AI what you want to post about.
                </p>
              </div>

              <div className="sparkle">✦</div>
            </div>

            {/* =================================================
                TOPIC
                ================================================= */}

            <div className="field">
              <label htmlFor="topic">
                Topic
                <span className="optional">
                  Optional if image is provided
                </span>
              </label>

              <textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Example: I completed my Networking Essentials certification..."
                rows={5}
              />
            </div>

            {/* =================================================
                PLATFORM
                ================================================= */}

            <div className="field">
              <label htmlFor="platform">
                Platform
              </label>

              <select
                id="platform"
                value={platform}
                onChange={(e) =>
                  setPlatform(e.target.value)
                }
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
            </div>

            {/* =================================================
                TONE
                ================================================= */}

            <div className="field">
              <label htmlFor="tone">
                Tone
              </label>

              <select
                id="tone"
                value={tone}
                onChange={(e) =>
                  setTone(e.target.value)
                }
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
            </div>

            {/* =================================================
                IMAGE UPLOAD
                ================================================= */}

            <div className="field">
              <label>
                Image
                <span className="optional">
                  Optional
                </span>
              </label>

              {/* Hidden file input */}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />

              {/* =================================================
                  NO IMAGE SELECTED
                  ================================================= */}

              {!uploadedFileName ? (
                <button
                  type="button"
                  className="upload-button"
                  onClick={openFilePicker}
                  disabled={uploading || loading}
                >
                  {uploading ? (
                    <>
                      <span className="spinner"></span>
                      Uploading {uploadProgress}%
                    </>
                  ) : (
                    <>📷 Upload Image</>
                  )}
                </button>
              ) : (
                /* =================================================
                   IMAGE UPLOADED
                   ================================================= */

                <div className="uploaded-image-box">
                  <div className="uploaded-image-info">
                    <span className="uploaded-check">
                      ✓
                    </span>

                    <div>
                      <strong>
                        {uploadedFileName}
                      </strong>

                      <small>
                        Uploaded successfully to Amazon S3
                      </small>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="remove-image-button"
                    onClick={removeImage}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              )}

              <small>
                JPG, PNG, WEBP or GIF • Maximum 5 MB
              </small>

              {/* =================================================
                  S3 STATUS
                  ================================================= */}

              {imageKey && (
                <small className="s3-upload-status">
                  ✓ S3 image ready for AI processing
                </small>
              )}
            </div>

            {/* =================================================
                ERROR
                ================================================= */}

            {error && (
              <div className="error-box">
                <span>⚠</span>

                <p>{error}</p>
              </div>
            )}

            {/* =================================================
                ACTION BUTTONS
                ================================================= */}

            <div className="actions">
              <button
                className="generate-button"
                onClick={generatePost}
                disabled={loading || uploading}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Generating...
                  </>
                ) : (
                  <>✦ Generate Post</>
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
          </section>

          {/* =================================================
              RESULT CARD
              ================================================= */}

          <section className="card result-card">
            <div className="card-header">
              <div>
                <h3>Generated content</h3>

                <p>
                  Your AI-generated social media post
                  will appear here.
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
                EMPTY STATE
                ================================================= */}

            {!content && !loading && (
              <div className="empty-state">
                <div className="empty-icon">
                  ✦
                </div>

                <h4>
                  Your post will appear here
                </h4>

                <p>
                  Enter a topic, upload an image if
                  needed, choose your platform and tone,
                  then click
                  <strong> Generate Post</strong>.
                </p>
              </div>
            )}

            {/* =================================================
                LOADING STATE
                ================================================= */}

            {loading && (
              <div className="loading-state">
                <div className="large-spinner"></div>

                <h4>
                  Creating your post...
                </h4>

                <p>
                  Amazon Nova 2 Lite is generating
                  your content.
                </p>
              </div>
            )}

            {/* =================================================
                RESULT
                ================================================= */}

            {content && !loading && (
              <div className="result-content">
                <div className="post-meta">
                  <span>{platform}</span>

                  <span>{tone}</span>

                  {imageKey && (
                    <span>
                      Image included
                    </span>
                  )}
                </div>

                <div className="post-text">
                  {content}
                </div>

                {/* =================================================
                    HASHTAGS
                    ================================================= */}

                {hashtags.length > 0 && (
                  <div className="hashtags-section">
                    <h4>Hashtags</h4>

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

                {/* =================================================
                    COPY BUTTON
                    ================================================= */}

                <button
                  className="copy-full-button"
                  onClick={copyPost}
                >
                  {copied
                    ? "✓ Copied to clipboard"
                    : "📋 Copy Post & Hashtags"}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* =====================================================
            ARCHITECTURE
            ===================================================== */}

        <section className="architecture">
          <p>Powered by</p>

          <div className="architecture-items">
            <span>React</span>

            <span>→</span>

            <span>AWS Amplify</span>

            <span>→</span>

            <span>Amazon S3</span>

            <span>→</span>

            <span>API Gateway</span>

            <span>→</span>

            <span>AWS Lambda</span>

            <span>→</span>

            <span>Amazon Bedrock</span>
          </div>
        </section>
      </main>

      {/* =====================================================
          FOOTER
          ===================================================== */}

      <footer>
        <p>
          AI Social Media Generator • Built with AWS & React
        </p>
      </footer>
    </div>
  );
}

export default App;
