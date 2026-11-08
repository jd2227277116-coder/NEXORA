
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  Trash2,
  X,
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
const STORY_DURATION = 7000;

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

  const fileInput = useRef<HTMLInputElement>(null);

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

    const userIds = [
      ...new Set(activeStories.map((story) => story.user_id)),
    ];

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
    // Se carga al montar el componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const groups = useMemo(() => {
    const grouped: Record<string, Story[]> = {};

    stories.forEach((story) => {
      if (!grouped[story.user_id]) {
        grouped[story.user_id] = [];
      }

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

  const myGroupIndex = groups.findIndex(
    (group) => group.user.id === userId
  );

  const activeGroup =
    viewer !== null ? groups[viewer.groupIndex] : null;

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

    if (viewer.storyIndex < group.stories.length - 1) {
      setViewer({
        ...viewer,
        storyIndex: viewer.storyIndex + 1,
      });
      setProgress(0);
      return;
    }

    if (viewer.groupIndex < groups.length - 1) {
      setViewer({
        groupIndex: viewer.groupIndex + 1,
        storyIndex: 0,
      });
      setProgress(0);
      return;
    }

    closeViewer();
  };

  const previousStory = () => {
    if (!viewer) return;

    if (viewer.storyIndex > 0) {
      setViewer({
        ...viewer,
        storyIndex: viewer.storyIndex - 1,
      });
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

  useEffect(() => {
    if (!activeStory || paused || !viewer) return;

    setProgress(0);

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const percentage = Math.min(
        100,
        (elapsed / STORY_DURATION) * 100
      );

      setProgress(percentage);

      if (percentage >= 100) {
        window.clearInterval(interval);
        nextStory();
      }
    }, 80);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStory?.id, paused, viewer?.groupIndex, viewer?.storyIndex]);

  const uploadStory = async (file: File) => {
    setError("");

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      setError("Selecciona una imagen o un video.");
      return;
    }

    if (isImage && file.size > IMAGE_LIMIT) {
      setError("La imagen no puede superar los 10 MB.");
      return;
    }

    if (isVideo && file.size > VIDEO_LIMIT) {
      setError("El video no puede superar los 50 MB.");
      return;
    }

    setUploading(true);

    const extension = file.name.split(".").pop()?.toLowerCase() || (
      isImage ? "jpg" : "mp4"
    );

    const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("stories")
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      setError("No se pudo subir el archivo. Revisa Storage.");
      setUploading(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("stories")
      .insert({
        user_id: userId,
        media_path: path,
        media_type: isImage ? "image" : "video",
        caption: "",
        audience: "everyone",
      });

    if (insertError) {
      await supabase.storage.from("stories").remove([path]);
      setError("El archivo se subió, pero no se pudo guardar la historia.");
      setUploading(false);
      return;
    }

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

    await supabase.storage
      .from("stories")
      .remove([activeStory.media_path]);

    const remaining = activeGroup?.stories.length || 0;

    if (remaining > 1 && viewer) {
      const nextIndex = Math.min(
        viewer.storyIndex,
        remaining - 2
      );

      setViewer({
        ...viewer,
        storyIndex: nextIndex,
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
                  {group.user.id === userId
                    ? "Tu historia"
                    : group.user.username || "Usuario"}
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
            if (file) uploadStory(file);
            event.currentTarget.value = "";
          }}
        />

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

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                previousStory();
              }}
              className="absolute left-0 top-1/2 -translate-y-1/2 p-4 text-white"
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
              className="absolute right-0 top-1/2 -translate-y-1/2 p-4 text-white"
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
