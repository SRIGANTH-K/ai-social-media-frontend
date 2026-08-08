import { useState } from "react";
import "./App.css";

const API_URL =
  "https://9bd3e5wwxb.execute-api.us-east-1.amazonaws.com/generate";

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

function App() {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("LinkedIn");
  const [tone, setTone] = useState("Professional");
  const [imageKey, setImageKey] = useState("");

  const [content, setContent] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generatePost() {
    setError("");
    setContent("");
    setHashtags([]);
    setCopied(false);

    if (!topic.trim() && !imageKey.trim()) {
      setError("Please enter a topic or provide an S3 image key.");
      return;
    }

    setLoading(true);

    try {
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

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate the post.");
      }

      setContent(data.content || "");
      setHashtags(data.hashtags || []);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

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

  function clearAll() {
    setTopic("");
    setImageKey("");
    setContent("");
    setHashtags([]);
    setError("");
    setCopied(false);
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">✦</div>

          <div>
            <h1>AI Social Media Generator</h1>
            <p>Create professional social media content with AI</p>
          </div>
        </div>

        <div className="status">
          <span className="status-dot"></span>
          AI Powered
        </div>
      </header>

      {/* Main */}
      <main className="container">
        <section className="hero">
          <span className="hero-badge">AWS • Amazon Bedrock</span>

          <h2>
            Turn your ideas into
            <span> engaging posts.</span>
          </h2>

          <p>
            Generate polished social media content using Amazon Nova 2 Lite.
          </p>
        </section>

        <div className="workspace">
          {/* Generator Card */}
          <section className="card generator-card">
            <div className="card-header">
              <div>
                <h3>Create your post</h3>
                <p>Tell the AI what you want to post about.</p>
              </div>

              <div className="sparkle">✦</div>
            </div>

            {/* Topic */}
            <div className="field">
              <label htmlFor="topic">
                Topic
                <span className="optional">Optional if image is provided</span>
              </label>

              <textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Example: I completed my Networking Essentials certification..."
                rows={5}
              />
            </div>

            {/* Platform */}
            <div className="field">
              <label htmlFor="platform">Platform</label>

              <select
                id="platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="LinkedIn">LinkedIn</option>
                <option value="Instagram">Instagram</option>
                <option value="Facebook">Facebook</option>
                <option value="X">X / Twitter</option>
              </select>
            </div>

            {/* Tone */}
            <div className="field">
              <label htmlFor="tone">Tone</label>

              <select
                id="tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              >
                <option value="Professional">Professional</option>
                <option value="Friendly">Friendly</option>
                <option value="Casual">Casual</option>
                <option value="Inspirational">Inspirational</option>
                <option value="Confident">Confident</option>
              </select>
            </div>

            {/* Image Key */}
            <div className="field">
              <label htmlFor="imageKey">
                S3 Image Key
                <span className="optional">Optional</span>
              </label>

              <input
                id="imageKey"
                type="text"
                value={imageKey}
                onChange={(e) => setImageKey(e.target.value)}
                placeholder="Example: WhatsApp Image 2026-04-22 at 23.10.55.jpeg"
              />

              <small>
                Enter the image filename/key stored in your AWS S3 bucket.
              </small>
            </div>

            {/* Error */}
            {error && (
              <div className="error-box">
                <span>⚠</span>
                <p>{error}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="actions">
              <button
                className="generate-button"
                onClick={generatePost}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    ✦ Generate Post
                  </>
                )}
              </button>

              <button className="clear-button" onClick={clearAll}>
                Clear
              </button>
            </div>
          </section>

          {/* Result Card */}
          <section className="card result-card">
            <div className="card-header">
              <div>
                <h3>Generated content</h3>
                <p>Your AI-generated social media post will appear here.</p>
              </div>

              {content && (
                <button className="copy-button" onClick={copyPost}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              )}
            </div>

            {!content && !loading && (
              <div className="empty-state">
                <div className="empty-icon">✦</div>

                <h4>Your post will appear here</h4>

                <p>
                  Enter a topic, choose your platform and tone, then click
                  <strong> Generate Post</strong>.
                </p>
              </div>
            )}

            {loading && (
              <div className="loading-state">
                <div className="large-spinner"></div>

                <h4>Creating your post...</h4>

                <p>
                  Amazon Nova 2 Lite is generating your content.
                </p>
              </div>
            )}

            {content && !loading && (
              <div className="result-content">
                <div className="post-meta">
                  <span>{platform}</span>
                  <span>{tone}</span>
                  {imageKey && <span>Image included</span>}
                </div>

                <div className="post-text">{content}</div>

                {hashtags.length > 0 && (
                  <div className="hashtags-section">
                    <h4>Hashtags</h4>

                    <div className="hashtags">
                      {hashtags.map((hashtag, index) => (
                        <span key={`${hashtag}-${index}`} className="hashtag">
                          {hashtag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button className="copy-full-button" onClick={copyPost}>
                  {copied
                    ? "✓ Copied to clipboard"
                    : "📋 Copy Post & Hashtags"}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Architecture */}
        <section className="architecture">
          <p>Powered by</p>

          <div className="architecture-items">
            <span>React</span>
            <span>→</span>
            <span>AWS Amplify</span>
            <span>→</span>
            <span>API Gateway</span>
            <span>→</span>
            <span>AWS Lambda</span>
            <span>→</span>
            <span>Amazon Bedrock</span>
          </div>
        </section>
      </main>

      <footer>
        <p>
          AI Social Media Generator • Built with AWS & React
        </p>
      </footer>
    </div>
  );
}

export default App;
