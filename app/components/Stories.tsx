
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  Trash2,
  X,
  Music2,
  ImagePlus,
  Play,
  Check,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type Story = {
  id: string;
  user_id: string;
  media_path: string;
  media_type: "image" | "video";
  caption: string | null;
  audience: string;
  created_at: string;
  expires_at: string;
  music_provider?: string | null;
  music_title?: string | null;
  music_artist?: string | null;
  music_audio_url?: string | null;
  music_path?: string | null;
  music_start_seconds?: number | null;
  music_duration_seconds?: number | null;
};

type StoryProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type StoryGroup = {
  user: StoryProfile;
  stories: Story[];
};

type StoriesProps = {
  userId: string;
  profile: StoryProfile;
};

const IMAGE_LIMIT = 10 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;
const AUDIO_LIMIT = 20 * 1024 * 1024;
const STORY_DURATION = 7000;
const MUSIC_DURATION = 15000;

const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac"];

export default function Stories({ userId, profile }: StoriesProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [profiles, setProfiles] = useState<Record<string, StoryProfile>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [viewer, setViewer] = useState<{
    groupIndex: number;
    storyIndex: number;
  } | null>(null);

  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");

  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<File | null>(null);
  const [musicTitle, setMusicTitle] = useState("");
  const [musicArtist, setMusicArtist] = useState("");
  const [musicStart, setMusicStart] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedAudio) {
      setAudioPreviewUrl("");
      setAudioDuration(0);
      return;
    }

    const url = URL.createObjectURL(selectedAudio);
    setAudioPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [selectedAudio]);

  const loadStories = async () => {
    setLoading(true);

    const { data, error: queryError } = await supabase
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (queryError) {
      setError("No se pudieron cargar las historias.");
      setLoading(false);
      return;
    }

    const activeStories = (data || []) as Story[];
    setStories(activeStories);

    const userIds = [...new Set(activeStories.map((story) => story.user_id))];

    if (userIds.length > 0) {
      const { data: people } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", userIds);

      const profileMap: Record<string, StoryProfile> = {};

      (people || []).forEach((person) => {
        profileMap[person.id] = person as StoryProfile;
      });

      profileMap[userId] = profile;
      setProfiles(profileMap);
    } else {
      setProfiles({ [userId]: profile });
    }

    setLoading(false);
  };

  useEffect(() => {
    loadStories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const groups = useMemo(() => {
    const grouped: Record<string, Story[]> = {};

    stories.forEach((story) => {
      if (!grouped[story.user_id]) grouped[story.user_id] = [];
      grouped[story.user_id].push(story);
    });

    const result: StoryGroup[] = Object.entries(grouped).map(
      ([id, userStories]) => ({
        user: profiles[id] || {
          id,
          username: "usuario",
          full_name: "Usuario Nexora",
          avatar_url: null,
        },
        stories: userStories.sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        ),
      })
    );

    return result.sort((a, b) => {
      if (a.user.id === userId) return -1;
      if (b.user.id === userId) return 1;

      return (
        new Date(b.stories[b.stories.length - 1].created_at).getTime() -
        new Date(a.stories[a.stories.length - 1].created_at).getTime()
      );
    });
  }, [stories, profiles, userId]);

  const activeGroup = viewer ? groups[viewer.groupIndex] : null;

  const activeStory =
    activeGroup && viewer
      ? activeGroup.stories[viewer.storyIndex]
      : null;

  const closeViewer = () => {
    setViewer(null);
    setProgress(0);
    setPaused(false);
  };

  const nextStory = () => {
    if (!viewer) return;

    const group = groups[viewer.groupIndex];
    if (!group) return;

    if (viewer.storyIndex < group.stories.length - 1) {
      setViewer({ ...viewer, storyIndex: viewer.storyIndex + 1 });
      setProgress(0);
      return;
    }

    if (viewer.groupIndex < groups.length - 1) {
      setViewer({ groupIndex: viewer.groupIndex + 1, storyIndex: 0 });
      setProgress(0);
      return;
    }

    closeViewer();
  };

  const previousStory = () => {
    if (!viewer) return;

    if (viewer.storyIndex > 0) {
      setViewer({ ...viewer, storyIndex: viewer.storyIndex - 1 });
      setProgress(0);
      return;
    }

    if (viewer.groupIndex > 0) {
      const previousGroup = groups[viewer.groupIndex - 1];

      setViewer({
        groupIndex: viewer.groupIndex - 1,
        storyIndex: previousGroup.stories.length - 1,
      });

      setProgress(0);
    }
  };

  const storyDuration =
    activeStory?.music_audio_url ? MUSIC_DURATION : STORY_DURATION;

  useEffect(() => {
    if (!activeStory || paused || !viewer) return;

    setProgress(0);

    const startedAt = Date.now();

    const interval = window.setInterval(() => {
      const percentage = Math.min(
        100,
        ((Date.now() - startedAt) / storyDuration) * 100
      );

      setProgress(percentage);

      if (percentage >= 100) {
        window.clearInterval(interval);
        nextStory();
      }
    }, 80);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeStory?.id,
    paused,
    viewer?.groupIndex,
    viewer?.storyIndex,
    storyDuration,
  ]);

  const resetComposer = () => {
    setSelectedMedia(null);
    setSelectedAudio(null);
    setMusicTitle("");
    setMusicArtist("");
    setMusicStart(0);
    setAudioDuration(0);
    setPermissionConfirmed(false);

    if (fileInput.current) fileInput.current.value = "";
    if (audioInput.current) audioInput.current.value = "";
  };

  const uploadStory = async () => {
    if (!selectedMedia) {
      setError("Primero selecciona una foto o un vídeo.");
      return;
    }

    setError("");

    const media = selectedMedia;
    const isImage = media.type.startsWith("image/");
    const isVideo = media.type.startsWith("video/");

    if (!isImage && !isVideo) {
      setError("Selecciona una imagen o un vídeo válido.");
      return;
    }

    if (isImage && media.size > IMAGE_LIMIT) {
      setError("La imagen no puede superar los 10 MB.");
      return;
    }

    if (isVideo && media.size > VIDEO_LIMIT) {
      setError("El vídeo no puede superar los 50 MB.");
      return;
    }

    if (selectedAudio) {
      const extension = selectedAudio.name
        .split(".")
        .pop()
        ?.toLowerCase();

      if (!extension || !AUDIO_EXTENSIONS.includes(extension)) {
        setError("El audio debe ser MP3, WAV, M4A o AAC.");
        return;
      }

      if (selectedAudio.size > AUDIO_LIMIT) {
        setError("La música no puede superar los 20 MB.");
        return;
      }

      if (!permissionConfirmed) {
        setError("Confirma que tienes permiso para compartir esta música.");
        return;
      }
    }

    setUploading(true);

    const mediaExtension =
      media.name.split(".").pop()?.toLowerCase() || (isImage ? "jpg" : "mp4");

    const mediaPath = `${userId}/${Date.now()}-${crypto.randomUUID()}.${mediaExtension}`;

    const { error: mediaUploadError } = await supabase.storage
      .from("stories")
      .upload(mediaPath, media, {
        contentType: media.type,
        upsert: false,
      });

    if (mediaUploadError) {
      setError("No se pudo subir la foto o el vídeo. Revisa Storage.");
      setUploading(false);
      return;
    }

    let audioPath: string | null = null;
    let audioUrl: string | null = null;

    if (selectedAudio) {
      const audioExtension =
        selectedAudio.name.split(".").pop()?.toLowerCase() || "mp3";

      audioPath = `${userId}/music-${Date.now()}-${crypto.randomUUID()}.${audioExtension}`;

      const audioMime =
        selectedAudio.type ||
        (audioExtension === "m4a"
          ? "audio/mp4"
          : audioExtension === "wav"
            ? "audio/wav"
            : audioExtension === "aac"
              ? "audio/aac"
              : "audio/mpeg");

      const { error: audioUploadError } = await supabase.storage
        .from("stories")
        .upload(audioPath, selectedAudio, {
          contentType: audioMime,
          upsert: false,
        });

      if (audioUploadError) {
        await supabase.storage.from("stories").remove([mediaPath]);
        setError("No se pudo subir la música. Revisa Storage.");
        setUploading(false);
        return;
      }

      audioUrl = supabase.storage
        .from("stories")
        .getPublicUrl(audioPath).data.publicUrl;
    }

    const { error: insertError } = await supabase.from("stories").insert({
      user_id: userId,
      media_path: mediaPath,
      media_type: isImage ? "image" : "video",
      caption: "",
      audience: "everyone",
      music_provider: selectedAudio ? "user_upload" : null,
      music_title: selectedAudio ? musicTitle.trim() || "Mi música" : null,
      music_artist: selectedAudio ? musicArtist.trim() || null : null,
      music_audio_url: audioUrl,
      music_path: audioPath,
      music_start_seconds: selectedAudio ? Math.floor(musicStart) : 0,
      music_duration_seconds: selectedAudio ? 15 : null,
    });

    if (insertError) {
      await supabase.storage.from("stories").remove([mediaPath]);

      if (audioPath) {
        await supabase.storage.from("stories").remove([audioPath]);
      }

      setError(
        "No se pudo guardar la historia. Comprueba que ejecutaste el SQL de música."
      );

      setUploading(false);
      return;
    }

    resetComposer();
    await loadStories();
    setUploading(false);
  };

  const deleteStory = async () => {
    if (!activeStory || activeStory.user_id !== userId) return;

    const { error: deleteError } = await supabase
      .from("stories")
      .delete()
      .eq("id", activeStory.id)
      .eq("user_id", userId);

    if (deleteError) {
      setError("No se pudo eliminar la historia.");
      return;
    }

    const filesToRemove = [activeStory.media_path];

    if (activeStory.music_path) {
      filesToRemove.push(activeStory.music_path);
    }

    await supabase.storage.from("stories").remove(filesToRemove);

    const remaining = activeGroup?.stories.length || 0;

    if (remaining > 1 && viewer) {
      setViewer({
        ...viewer,
        storyIndex: Math.min(viewer.storyIndex, remaining - 2),
      });
    } else {
      closeViewer();
    }

    await loadStories();
  };

  const openGroup = (groupIndex: number) => {
    setViewer({ groupIndex, storyIndex: 0 });
    setProgress(0);
    setPaused(false);
  };

  const getMediaUrl = (path: string) =>
    supabase.storage.from("stories").getPublicUrl(path).data.publicUrl;

  return (
    <>
      <section className="glass-panel p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-black text-lg">Historias</h2>
            <p className="text-xs text-slate-400">
              Comparte momentos durante 24 horas
            </p>
          </div>

          {uploading && (
            <LoaderCircle
              size={20}
              className="animate-spin text-blue-600"
            />
          )}
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="flex flex-col items-center gap-2 shrink-0 w-[68px] disabled:opacity-50"
          >
            <span className="relative w-[62px] h-[62px] rounded-full bg-blue-50 border-2 border-dashed border-blue-300 flex items-center justify-center overflow-hidden">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Tu perfil"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-blue-600 font-black text-xl">
                  {(profile.full_name || "T").charAt(0).toUpperCase()}
                </span>
              )}

              <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-blue-600 text-white border-2 border-white flex items-center justify-center">
                <Plus size={15} />
              </span>
            </span>

            <span className="text-xs font-semibold truncate w-full text-center">
              Tu historia
            </span>
          </button>

          {groups.map((group, index) => {
            if (group.user.id === userId) return null;

            return (
              <button
                type="button"
                key={group.user.id}
                onClick={() => openGroup(index)}
                className="flex flex-col items-center gap-2 shrink-0 w-[68px]"
              >
                <span className="w-[62px] h-[62px] rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
                  <span className="block w-full h-full rounded-full border-[2px] border-white overflow-hidden bg-slate-100">
                    {group.user.avatar_url ? (
                      <img
                        src={group.user.avatar_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center font-bold text-blue-600">
                        {(group.user.full_name || "U")
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                    )}
                  </span>
                </span>

                <span className="text-xs font-semibold truncate w-full text-center">
                  {group.user.username || "Usuario"}
                </span>
              </button>
            );
          })}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setSelectedMedia(file);
              setError("");
            }
            event.currentTarget.value = "";
          }}
        />

        {selectedMedia && (
          <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm flex items-center gap-2">
                <ImagePlus size={17} />
                Tu publicación
              </p>

              <button
                type="button"
                onClick={resetComposer}
                className="p-1 text-slate-500"
                aria-label="Cancelar publicación"
              >
                <X size={19} />
              </button>
            </div>

            <p className="text-xs text-slate-500 truncate">
              {selectedMedia.name}
            </p>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
              <p className="font-bold text-sm flex items-center gap-2 mb-2">
                <Music2 size={17} />
                Añadir música
              </p>

              {!selectedAudio ? (
                <button
                  type="button"
                  onClick={() => audioInput.current?.click()}
                  className="w-full rounded-xl border border-dashed border-blue-400 p-3 text-sm font-semibold text-blue-600 flex items-center justify-center gap-2"
                >
                  <Plus size={17} />
                  Elegir música de mi dispositivo
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 break-all">
                    {selectedAudio.name}
                  </p>

                  <audio
                    key={audioPreviewUrl}
                    src={audioPreviewUrl}
                    controls
                    preload="metadata"
                    className="w-full"
                    onLoadedMetadata={(event) => {
                      const duration = event.currentTarget.duration;
                      if (Number.isFinite(duration)) {
                        setAudioDuration(duration);
                        setMusicStart(0);
                      }
                    }}
                  />

                  {audioDuration > 15 && (
                    <div>
                      <div className="flex justify-between text-xs mb-2">
                        <span>Inicio del fragmento</span>
                        <span>{Math.floor(musicStart)} s</span>
                      </div>

                      <input
                        type="range"
                        min="0"
                        max={Math.max(0, Math.floor(audioDuration - 15))}
                        step="1"
                        value={musicStart}
                        onChange={(event) =>
                          setMusicStart(Number(event.target.value))
                        }
                        className="w-full accent-blue-600"
                      />

                      <p className="text-xs text-slate-500">
                        Se compartirán 15 segundos desde el punto seleccionado.
                      </p>
                    </div>
                  )}

                  <input
                    type="text"
                    value={musicTitle}
                    onChange={(event) => setMusicTitle(event.target.value)}
                    placeholder="Nombre de la canción (opcional)"
                    maxLength={100}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent p-3 text-sm outline-none"
                  />

                  <input
                    type="text"
                    value={musicArtist}
                    onChange={(event) => setMusicArtist(event.target.value)}
                    placeholder="Artista (opcional)"
                    maxLength={100}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent p-3 text-sm outline-none"
                  />

                  <label className="flex items-start gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={permissionConfirmed}
                      onChange={(event) =>
                        setPermissionConfirmed(event.target.checked)
                      }
                      className="mt-0.5 accent-blue-600"
                    />
                    Confirmo que tengo autorización para compartir este audio
                    en Nexora.
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAudio(null);
                      setMusicTitle("");
                      setMusicArtist("");
                      setMusicStart(0);
                      setPermissionConfirmed(false);
                      if (audioInput.current) audioInput.current.value = "";
                    }}
                    className="text-xs text-red-500 font-semibold"
                  >
                    Quitar música
                  </button>
                </div>
              )}

              <input
                ref={audioInput}
                type="file"
                accept=".mp3,.wav,.m4a,.aac,audio/mpeg,audio/wav,audio/mp4,audio/aac"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setSelectedAudio(file);
                    setMusicStart(0);
                    setPermissionConfirmed(false);
                    setError("");
                  }
                  event.currentTarget.value = "";
                }}
              />
            </div>

            <button
              type="button"
              onClick={uploadStory}
              disabled={uploading || (Boolean(selectedAudio) && !permissionConfirmed)}
              className="w-full rounded-xl bg-blue-600 text-white p-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {uploading ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Check size={18} />
              )}
              {uploading ? "Publicando..." : "Publicar historia"}
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500 mt-3">{error}</p>
        )}

        {loading && (
          <p className="text-xs text-slate-400 mt-2">
            Cargando historias...
          </p>
        )}
      </section>

      {viewer !== null && activeStory && activeGroup && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
          onClick={() => setPaused((value) => !value)}
        >
          <div className="relative w-full h-full sm:max-w-md sm:h-[92vh] sm:rounded-3xl overflow-hidden bg-black">
            <div className="absolute top-0 inset-x-0 z-20 p-3">
              <div className="flex gap-1 mb-4">
                {activeGroup.stories.map((story, index) => (
                  <div
                    key={story.id}
                    className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden"
                  >
                    <div
                      className="h-full bg-white rounded-full"
                      style={{
                        width:
                          index < viewer.storyIndex
                            ? "100%"
                            : index === viewer.storyIndex
                              ? `${progress}%`
                              : "0%",
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 text-white">
                {activeGroup.user.avatar_url ? (
                  <img
                    src={activeGroup.user.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">
                    {(activeGroup.user.full_name || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">
                    {activeGroup.user.full_name || "Usuario Nexora"}
                  </p>
                  <p className="text-xs text-white/70">
                    @{activeGroup.user.username || "usuario"}
                  </p>
                </div>

                {activeStory.user_id === userId && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteStory();
                    }}
                    className="p-2 text-white"
                    aria-label="Eliminar historia"
                  >
                    <Trash2 size={20} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeViewer();
                  }}
                  className="p-2 text-white"
                  aria-label="Cerrar historias"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {activeStory.media_type === "video" ? (
              <video
                key={activeStory.id}
                src={getMediaUrl(activeStory.media_path)}
                autoPlay
                muted={Boolean(activeStory.music_audio_url)}
                playsInline
                controls
                className="w-full h-full object-contain"
                onEnded={nextStory}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <img
                src={getMediaUrl(activeStory.media_path)}
                alt="Historia"
                className="w-full h-full object-contain"
              />
            )}

            {activeStory.music_audio_url && (
              <div
                className="absolute bottom-16 left-4 right-4 z-20"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center gap-2 text-white mb-2">
                  <Music2 size={17} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">
                      {activeStory.music_title || "Mi música"}
                    </p>
                    {activeStory.music_artist && (
                      <p className="text-xs text-white/70 truncate">
                        {activeStory.music_artist}
                      </p>
                    )}
                  </div>
                </div>

                <audio
                  key={activeStory.id}
                  src={activeStory.music_audio_url}
                  autoPlay={!paused}
                  controls
                  preload="auto"
                  className="w-full h-9"
                  onLoadedMetadata={(event) => {
                    event.currentTarget.currentTime =
                      activeStory.music_start_seconds || 0;
                  }}
                  onTimeUpdate={(event) => {
                    const start = activeStory.music_start_seconds || 0;
                    const duration =
                      activeStory.music_duration_seconds || 15;

                    if (event.currentTarget.currentTime >= start + duration) {
                      event.currentTarget.pause();
                    }
                  }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                previousStory();
              }}
              className="absolute left-0 top-1/2 -translate-y-1/2 p-4 text-white z-30"
              aria-label="Historia anterior"
            >
              <ChevronLeft size={28} />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                nextStory();
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-4 text-white z-30"
              aria-label="Siguiente historia"
            >
              <ChevronRight size={28} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
