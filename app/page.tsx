"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Stories from "./components/Stories";
import {
  Home, Compass, MessageCircle, Bell, UserRound, Search,
  Heart, Send, LogOut, Settings, Camera, Trash2, X,
  Menu as MenuIcon, LoaderCircle, MessageSquare, AtSign,
  Sparkles, RefreshCw
} from "lucide-react";

type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type Post = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

type PageName =
  | "Inicio"
  | "Descubrir"
  | "Mensajes"
  | "Notificaciones"
  | "Perfil"
  | "Configuración";

const menu = [
  { label: "Inicio" as PageName, icon: Home },
  { label: "Descubrir" as PageName, icon: Compass },
  { label: "Mensajes" as PageName, icon: MessageCircle },
  { label: "Notificaciones" as PageName, icon: Bell },
  { label: "Perfil" as PageName, icon: UserRound },
  { label: "Configuración" as PageName, icon: Settings },
];

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [register, setRegister] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [page, setPage] = useState<PageName>("Inicio");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");

  const [posts, setPosts] = useState<Post[]>([]);
  const [postText, setPostText] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedContact, setSelectedContact] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");

  const [commentsByPost, setCommentsByPost] =
    useState<Record<string, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] =
    useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] =
    useState<Record<string, boolean>>({});

  const [likesByPost, setLikesByPost] =
    useState<Record<string, number>>({});
  const [likedPosts, setLikedPosts] = useState<string[]>([]);
  const [profilesById, setProfilesById] =
    useState<Record<string, Profile>>({});

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const notifyError = (message: string) => {
    setError(message);
    setNotice("");
  };

  const notifySuccess = (message: string) => {
    setNotice(message);
    setError("");
  };

  const currentProfile = (): Profile | null => {
    if (!user) return null;
    return {
      id: user.id,
      username,
      full_name: name,
      bio,
      avatar_url: avatar,
    };
  };

  const getProfile = (id: string): Profile | undefined => {
    if (id === user?.id) return currentProfile() || undefined;
    return profilesById[id];
  };

  const loadComments = useCallback(async (postId: string) => {
    const { data, error: requestError } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (requestError) {
      notifyError("No se pudieron cargar los comentarios.");
      return;
    }

    const list = (data || []) as Comment[];
    setCommentsByPost((old) => ({ ...old, [postId]: list }));

    const ids = [...new Set(list.map((item) => item.user_id))];
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ids);

      const map: Record<string, Profile> = {};
      (profiles || []).forEach((profile: Profile) => {
        map[profile.id] = profile;
      });
      setProfilesById((old) => ({ ...old, ...map }));
    }
  }, []);

  const loadData = useCallback(async (currentUser: User) => {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) notifyError("No se pudo cargar tu perfil.");

    if (profile) {
      setName(profile.full_name || "");
      setUsername(profile.username || "");
      setBio(profile.bio || "");
      setAvatar(profile.avatar_url || "");
    } else {
      const initialName =
        currentUser.user_metadata?.full_name ||
        currentUser.email?.split("@")[0] ||
        "Usuario";

      setName(initialName);

      await supabase.from("profiles").upsert({
        id: currentUser.id,
        full_name: initialName,
        username: `usuario_${currentUser.id.slice(0, 8)}`,
        bio: "",
      });
    }

    const { data: postData, error: postError } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (postError) {
      notifyError("No se pudieron cargar las publicaciones.");
      return;
    }

    const loaded = (postData || []) as Post[];
    setPosts(loaded);

    if (!loaded.length) {
      setCommentsByPost({});
      setLikesByPost({});
      setLikedPosts([]);
      return;
    }

    const postIds = loaded.map((post) => post.id);
    const authorIds = [...new Set(loaded.map((post) => post.user_id))];

    const [{ data: profiles }, { data: comments }, { data: likes }] =
      await Promise.all([
        supabase.from("profiles").select("*").in("id", authorIds),
        supabase.from("comments").select("*").in("post_id", postIds),
        supabase.from("likes").select("post_id,user_id").in("post_id", postIds),
      ]);

    const profileMap: Record<string, Profile> = {};
    (profiles || []).forEach((profile: Profile) => {
      profileMap[profile.id] = profile;
    });
    setProfilesById((old) => ({ ...old, ...profileMap }));

    const commentMap: Record<string, Comment[]> = {};
    (comments || []).forEach((comment: Comment) => {
      if (!commentMap[comment.post_id]) commentMap[comment.post_id] = [];
      commentMap[comment.post_id].push(comment);
    });
    setCommentsByPost(commentMap);

    const counts: Record<string, number> = {};
    const mine: string[] = [];

    (likes || []).forEach((like: { post_id: string; user_id: string }) => {
      counts[like.post_id] = (counts[like.post_id] || 0) + 1;
      if (like.user_id === currentUser.id) mine.push(like.post_id);
    });

    setLikesByPost(counts);
    setLikedPosts(mine);
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      const currentUser = data.session?.user || null;
      setUser(currentUser);

      if (currentUser) await loadData(currentUser);
      if (active) setLoading(false);
    }

    initialize();

    const { data: auth } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user || null;
        setUser(currentUser);

        if (currentUser) {
          window.setTimeout(() => {
            if (active) loadData(currentUser);
          }, 0);
        } else {
          setPosts([]);
        }
      }
    );

    return () => {
      active = false;
      auth.subscription.unsubscribe();
    };
  }, [loadData]);

  async function handleAuth() {
    if (!email.trim() || !password) {
      notifyError("Escribe tu correo y contraseña.");
      return;
    }

    if (register && !fullName.trim()) {
      notifyError("Escribe tu nombre.");
      return;
    }

    setSaving(true);

    try {
      if (register) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });

        if (authError) throw authError;

        if (data.user && data.session) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            full_name: fullName.trim(),
            username: `usuario_${data.user.id.slice(0, 8)}`,
            bio: "",
          });
          setUser(data.user);
          await loadData(data.user);
          notifySuccess("¡Tu cuenta Nexora está lista!");
        } else {
          notifySuccess("Cuenta creada. Revisa tu correo para confirmarla.");
        }
      } else {
        const { data, error: authError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (authError) throw authError;
        setUser(data.user);
        await loadData(data.user);
        notifySuccess("Sesión iniciada correctamente.");
      }
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Error de acceso.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setPosts([]);
    setMessages([]);
    setSelectedContact(null);
    setPage("Inicio");
  }

  async function saveProfile() {
    if (!user) return;

    const cleanUsername = username.trim().replace(/^@/, "");

    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      notifyError("El usuario debe tener entre 3 y 20 caracteres.");
      return;
    }

    if (!/^[a-zA-Z0-9_.]+$/.test(cleanUsername)) {
      notifyError("Usa letras, números, puntos o guiones bajos.");
      return;
    }

    setSaving(true);

    const { error: saveError } = await supabase.from("profiles").upsert({
      id: user.id,
      username: cleanUsername,
      full_name: name.trim(),
      bio: bio.trim(),
      avatar_url: avatar || null,
    });

    setSaving(false);

    if (saveError) {
      notifyError(
        saveError.code === "23505"
          ? "Ese nombre de usuario ya está ocupado."
          : saveError.message
      );
      return;
    }

    setUsername(cleanUsername);
    notifySuccess("Perfil actualizado.");
    await loadData(user);
  }

  async function uploadAvatar(file: File) {
    if (!user) return;

    if (!file.type.startsWith("image/")) {
      notifyError("Selecciona una imagen válida.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notifyError("La imagen debe pesar menos de 5 MB.");
      return;
    }

    setSaving(true);

    try {
      const extension = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = data.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          full_name: name,
          username,
          bio,
          avatar_url: url,
        });

      if (updateError) throw updateError;

      setAvatar(url);
      notifySuccess("Fotografía actualizada.");
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Error al subir imagen.");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!user || !postText.trim()) return;

    setSaving(true);

    const { error: publishError } = await supabase.from("posts").insert({
      user_id: user.id,
      content: postText.trim(),
    });

    setSaving(false);

    if (publishError) {
      notifyError("No se pudo publicar: " + publishError.message);
      return;
    }

    setPostText("");
    await loadData(user);
    notifySuccess("¡Publicación compartida!");
  }

  async function toggleLike(postId: string) {
    if (!user) return;

    const alreadyLiked = likedPosts.includes(postId);

    if (alreadyLiked) {
      const { error: deleteError } = await supabase
        .from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);

      if (deleteError) {
        notifyError("No se pudo quitar el Me gusta.");
        return;
      }

      setLikedPosts((old) => old.filter((id) => id !== postId));
      setLikesByPost((old) => ({
        ...old,
        [postId]: Math.max(0, (old[postId] || 0) - 1),
      }));
    } else {
      const { error: insertError } = await supabase.from("likes").insert({
        post_id: postId,
        user_id: user.id,
      });

      if (insertError) {
        notifyError("No se pudo dar Me gusta. Revisa la tabla likes.");
        return;
      }

      setLikedPosts((old) => [...old, postId]);
      setLikesByPost((old) => ({
        ...old,
        [postId]: (old[postId] || 0) + 1,
      }));
    }
  }

  async function addComment(postId: string) {
    if (!user) return;

    const content = (commentDrafts[postId] || "").trim();
    if (!content) return;

    const { error: commentError } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: user.id,
      content,
    });

    if (commentError) {
      notifyError("No se pudo publicar el comentario.");
      return;
    }

    setCommentDrafts((old) => ({ ...old, [postId]: "" }));
    await loadComments(postId);
    notifySuccess("Comentario publicado.");
  }

  async function deleteComment(comment: Comment) {
    if (!user) return;

    const post = posts.find((item) => item.id === comment.post_id);
    if (comment.user_id !== user.id && post?.user_id !== user.id) {
      notifyError("No puedes eliminar este comentario.");
      return;
    }

    const { error: deleteError } = await supabase
      .from("comments")
      .delete()
      .eq("id", comment.id);

    if (deleteError) {
      notifyError("No se pudo eliminar el comentario.");
      return;
    }

    await loadComments(comment.post_id);
    notifySuccess("Comentario eliminado.");
  }

  async function searchUsers() {
    if (!user) return;

    const term = searchTerm.trim().replace(/^@/, "");
    if (!term) {
      setSearchResults([]);
      setPostResults([]);
      return;
    }

    setSearching(true);

    const [{ data: people, error: peopleError }, { data: foundPosts }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
          .neq("id", user.id)
          .limit(20),
        supabase
          .from("posts")
          .select("*")
          .ilike("content", `%${term}%`)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

    if (peopleError) notifyError("No se pudo completar la búsqueda.");

    const peopleList = (people || []) as Profile[];
    setSearchResults(peopleList);
    setPostResults((foundPosts || []) as Post[]);

    const map: Record<string, Profile> = {};
    peopleList.forEach((person) => { map[person.id] = person; });
    setProfilesById((old) => ({ ...old, ...map }));

    setSearching(false);
  }

  async function openConversation(person: Profile) {
    setSelectedContact(person);
    setPage("Mensajes");

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", person.id)
      .maybeSingle();

    if (data) setSelectedContact(data as Profile);
  }

  const loadMessages = useCallback(async () => {
    if (!user || !selectedContact) return;

    const { data, error: messageError } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${selectedContact.id}),and(sender_id.eq.${selectedContact.id},recipient_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true });

    if (messageError) {
      notifyError("No se pudieron cargar los mensajes.");
      return;
    }

    setMessages((data || []) as Message[]);

    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", selectedContact.id)
      .eq("recipient_id", user.id)
      .is("read_at", null);
  }, [user, selectedContact]);

  useEffect(() => {
    if (!user || !selectedContact) return;

    loadMessages();
    const interval = window.setInterval(loadMessages, 5000);

    return () => window.clearInterval(interval);
  }, [user, selectedContact, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!user || !selectedContact) return;

    const content = messageText.trim();
    if (!content) return;

    const { error: sendError } = await supabase.from("messages").insert({
      sender_id: user.id,
      recipient_id: selectedContact.id,
      content,
    });

    if (sendError) {
      notifyError("No se pudo enviar el mensaje.");
      return;
    }

    setMessageText("");
    await loadMessages();
  }

  function navigate(destination: PageName) {
    setPage(destination);
    setMobileMenuOpen(false);
    if (destination !== "Mensajes") setSelectedContact(null);
  }

  function Avatar({
    profile,
    size = "md",
  }: {
    profile?: Profile | null;
    size?: "sm" | "md" | "lg";
  }) {
    const sizes = {
      sm: "w-9 h-9 text-sm",
      md: "w-11 h-11 text-base",
      lg: "w-24 h-24 text-3xl",
    };

    return (
      <div className={`${sizes[size]} shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-blue-100 to-sky-50 text-blue-600 flex items-center justify-center font-bold ring-1 ring-blue-100`}>
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt="Fotografía de perfil"
            className="w-full h-full object-cover"
          />
        ) : (
          (profile?.full_name || "N").slice(0, 1).toUpperCase()
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Sparkles size={38} className="text-blue-600 mx-auto mb-4" />
          <LoaderCircle className="animate-spin text-blue-500 mx-auto" />
          <p className="text-slate-500 mt-3">Iniciando Nexora...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-slate-100 flex items-center justify-center p-5">
        <div className="w-full max-w-md bg-white/80 backdrop-blur-2xl border border-white shadow-2xl rounded-[2rem] p-7 sm:p-9">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 text-white flex items-center justify-center mb-6">
            <Sparkles size={32} />
          </div>

          <h1 className="text-4xl font-black text-slate-900">
            Nexora<span className="text-blue-600">.</span>
          </h1>
          <p className="text-slate-500 mt-2 mb-8">
            Conecta, comparte y descubre.
          </p>

          {register && (
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nombre completo"
              className="glass-input mb-3"
            />
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electrónico"
            className="glass-input mb-3"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="glass-input mb-4"
          />

          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl mb-4">{error}</p>}
          {notice && <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-xl mb-4">{notice}</p>}

          <button
            onClick={handleAuth}
            disabled={saving}
            className="w-full rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 disabled:opacity-50"
          >
            {saving ? "Un momento..." : register ? "Crear cuenta" : "Iniciar sesión"}
          </button>

          <button
            onClick={() => { setRegister(!register); setError(""); setNotice(""); }}
            className="w-full text-blue-600 font-semibold mt-5"
          >
            {register ? "Ya tengo una cuenta" : "Crear una cuenta nueva"}
          </button>
        </div>

        <style jsx global>{`
          .glass-input {
            width: 100%;
            padding: 15px 17px;
            border-radius: 15px;
            outline: none;
            background: rgba(255,255,255,.85);
            border: 1px solid rgba(148,163,184,.25);
            color: #0f172a;
          }
          .glass-input:focus {
            border-color: #93c5fd;
            box-shadow: 0 0 0 3px rgba(59,130,246,.1);
          }
        `}</style>
      </main>
    );
  }

  const myProfile = currentProfile();

  return (
    <main className="min-h-screen bg-[#f5f8fd] text-slate-800 pb-24 md:pb-0">
      {/* Fondo decorativo: este contenedor queda cerrado antes del header. */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 -right-32 w-96 h-96 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 rounded-full bg-sky-100/50 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between">
          <button onClick={() => navigate("Inicio")} className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center text-white shadow-md">
              <Sparkles size={22} />
            </div>
            <span className="text-2xl font-black tracking-tight">
              Nexora<span className="text-blue-600">.</span>
            </span>
          </button>

          <div className="hidden md:flex items-center gap-2 text-sm text-slate-500">
            <span className="w-2 h-2 bg-emerald-400 rounded-full" />
            Tu espacio social
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("Perfil")}
              className="flex items-center gap-2 rounded-full bg-white border shadow-sm p-1.5 pr-3"
            >
              <Avatar profile={myProfile} size="sm" />
              <span className="hidden sm:block text-sm font-semibold max-w-28 truncate">
                {name || "Mi perfil"}
              </span>
            </button>

            <button
              onClick={logout}
              title="Cerrar sesión"
              className="w-10 h-10 rounded-full bg-white border flex items-center justify-center text-slate-500 hover:text-red-500"
            >
              <LogOut size={18} />
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-10 h-10 rounded-full bg-white border flex items-center justify-center"
            >
              {mobileMenuOpen ? <X size={20} /> : <MenuIcon size={20} />}
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-3 top-[80px] z-50 bg-white/95 backdrop-blur-xl border shadow-xl rounded-3xl p-3">
          {menu.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.label)}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-blue-50"
              >
                <Icon size={20} className="text-blue-600" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 py-6 md:py-8 grid grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)] gap-6">
        <aside className="hidden md:block">
          <div className="sticky top-24 bg-white/75 backdrop-blur-2xl border border-white rounded-3xl p-3 shadow-lg">
            <div className="p-3 mb-2">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Menú principal
              </p>
            </div>

            {menu.map((item) => {
              const Icon = item.icon;
              const active = page === item.label;

              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.label)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-1 transition ${
                    active
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                      : "text-slate-500 hover:bg-white hover:text-blue-600"
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-semibold">{item.label}</span>
                </button>
              );
            })}

            <div className="mt-5 p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-50">
              <Sparkles className="text-blue-500 mb-2" size={21} />
              <p className="font-bold text-sm">Bienvenido a Nexora</p>
              <p className="text-xs text-slate-500 mt-1">
                Tu comunidad, tus ideas, tus conexiones.
              </p>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          {error && (
            <div className="mb-5 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm">
              {notice}
            </div>
          )}

          {page === "Inicio" && (
            <>
              <Stories
                userId={user.id}
                profile={{
                  id: user.id,
                  username,
                  full_name: name,
                  avatar_url: avatar,
                }}
              />

              <div className="mb-7">
                <p className="text-blue-600 text-sm font-bold mb-1">TU COMUNIDAD</p>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Inicio</h1>
                <p className="text-slate-500 mt-2">Esto está pasando en Nexora.</p>
              </div>

              <div className="glass-panel p-4 sm:p-6 mb-7">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar profile={myProfile} />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{name}</p>
                    <p className="text-xs text-slate-500">@{username}</p>
                  </div>
                </div>

                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="¿Qué quieres compartir hoy? Puedes mencionar a alguien con @usuario."
                  className="w-full min-h-32 resize-y bg-white/80 border border-slate-100 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-blue-100"
                />

                <div className="flex items-center justify-between mt-3 gap-2">
                  <span className="text-xs text-slate-400">Comparte algo con tu comunidad.</span>
                  <button
                    onClick={publish}
                    disabled={saving || !postText.trim()}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-bold disabled:opacity-50"
                  >
                    <Send size={17} />
                    Publicar
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-xl">Tu feed</h2>
                <button
                  onClick={() => loadData(user)}
                  className="text-blue-600 flex items-center gap-2 text-sm font-semibold"
                >
                  <RefreshCw size={16} /> Actualizar
                </button>
              </div>

              {posts.length === 0 && (
                <div className="glass-panel p-10 text-center">
                  <Sparkles size={28} className="text-blue-500 mx-auto mb-4" />
                  <p className="font-bold">Todavía no hay publicaciones.</p>
                  <p className="text-sm text-slate-500 mt-2">¡Comparte la primera!</p>
                </div>
              )}

              {posts.map((post) => {
                const author = getProfile(post.user_id);
                const comments = commentsByPost[post.id] || [];
                const liked = likedPosts.includes(post.id);
                const expanded = !!expandedComments[post.id];

                return (
                  <article key={post.id} className="glass-panel p-4 sm:p-6 mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar profile={author} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold truncate">{author?.full_name || "Usuario Nexora"}</p>
                        <p className="text-xs text-slate-400">
                          {author?.username ? `@${author.username} · ` : ""}
                          {new Date(post.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <p className="my-5 whitespace-pre-wrap leading-relaxed break-words">
                      {post.content}
                    </p>

                    <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
                      <button
                        onClick={() => toggleLike(post.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                          liked ? "bg-rose-50 text-rose-600" : "text-slate-500 hover:bg-rose-50"
                        }`}
                      >
                        <Heart size={19} fill={liked ? "currentColor" : "none"} />
                        <span className="text-sm font-semibold">
                          Me gusta {likesByPost[post.id] || 0}
                        </span>
                      </button>

                      <button
                        onClick={async () => {
                          setExpandedComments((old) => ({
                            ...old,
                            [post.id]: !old[post.id],
                          }));
                          await loadComments(post.id);
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-500 hover:bg-blue-50"
                      >
                        <MessageCircle size={19} />
                        <span className="text-sm font-semibold">
                          {comments.length} comentarios
                        </span>
                      </button>
                    </div>

                    {expanded && (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <div className="flex gap-2 mb-4">
                          <input
                            value={commentDrafts[post.id] || ""}
                            onChange={(e) =>
                              setCommentDrafts((old) => ({
                                ...old,
                                [post.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addComment(post.id);
                            }}
                            placeholder="Escribe un comentario..."
                            className="flex-1 min-w-0 bg-white border rounded-xl px-4 py-3 outline-none"
                          />
                          <button
                            onClick={() => addComment(post.id)}
                            className="bg-blue-600 text-white px-4 rounded-xl"
                          >
                            <Send size={18} />
                          </button>
                        </div>

                        {comments.map((comment) => {
                          const commentAuthor = getProfile(comment.user_id);
                          const canDelete =
                            comment.user_id === user.id ||
                            post.user_id === user.id;

                          return (
                            <div key={comment.id} className="flex gap-2 items-start mb-3">
                              <Avatar profile={commentAuthor} size="sm" />
                              <div className="flex-1 min-w-0 bg-white/80 rounded-2xl p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-bold text-sm truncate">
                                    {commentAuthor?.full_name || "Usuario Nexora"}
                                  </p>
                                  {canDelete && (
                                    <button
                                      onClick={() => deleteComment(comment)}
                                      className="text-slate-400 hover:text-red-500"
                                      title="Eliminar comentario"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  )}
                                </div>
                                <p className="text-sm whitespace-pre-wrap break-words mt-1">
                                  {comment.content}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-2">
                                  {new Date(comment.created_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </>
          )}

          {page === "Descubrir" && (
            <>
              <div className="mb-7">
                <p className="text-blue-600 text-sm font-bold mb-1">EXPLORA</p>
                <h1 className="text-3xl sm:text-4xl font-black">Descubrir</h1>
                <p className="text-slate-500 mt-2">Encuentra personas y publicaciones.</p>
              </div>

              <div className="glass-panel p-3 flex gap-2 mb-6">
                <div className="flex-1 flex items-center gap-2 px-3 min-w-0">
                  <Search className="text-slate-400 shrink-0" size={20} />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") searchUsers();
                    }}
                    placeholder="Buscar personas o publicaciones..."
                    className="w-full min-w-0 bg-transparent outline-none py-2"
                  />
                </div>
                <button
                  onClick={searchUsers}
                  disabled={searching}
                  className="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold disabled:opacity-50"
                >
                  {searching ? "..." : "Buscar"}
                </button>
              </div>

              {searchResults.length > 0 && (
                <>
                  <h2 className="font-bold text-lg mb-3">Personas</h2>
                  <div className="space-y-3 mb-7">
                    {searchResults.map((person) => (
                      <div key={person.id} className="glass-panel p-4 flex items-center gap-3">
                        <Avatar profile={person} />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold truncate">{person.full_name || "Usuario"}</p>
                          <p className="text-sm text-blue-600">@{person.username || "usuario"}</p>
                        </div>
                        <button
                          onClick={() => openConversation(person)}
                          className="bg-blue-50 text-blue-700 px-3 py-2 rounded-xl text-sm font-bold"
                        >
                          Mensaje
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {postResults.length > 0 && (
                <>
                  <h2 className="font-bold text-lg mb-3">Publicaciones</h2>
                  <div className="space-y-3">
                    {postResults.map((post) => (
                      <div key={post.id} className="glass-panel p-4">
                        <p className="font-bold text-sm mb-2">
                          {getProfile(post.user_id)?.full_name || "Usuario Nexora"}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{post.content}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {searchTerm.trim() && !searching &&
                searchResults.length === 0 && postResults.length === 0 && (
                  <div className="glass-panel p-8 text-center text-slate-500">
                    No encontramos resultados para esa búsqueda.
                  </div>
                )}
            </>
          )}

          {page === "Perfil" && (
            <>
              <div className="mb-7">
                <p className="text-blue-600 text-sm font-bold mb-1">TU ESPACIO</p>
                <h1 className="text-3xl sm:text-4xl font-black">Mi perfil</h1>
              </div>

              <div className="glass-panel p-5 sm:p-8">
                <div className="flex flex-col items-center mb-7">
                  <Avatar profile={myProfile} size="lg" />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 text-blue-600 font-bold mt-4"
                  >
                    <Camera size={17} /> Cambiar fotografía
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadAvatar(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </div>

                <p className="text-sm text-slate-500 mb-6 text-center">{user.email}</p>

                <label className="block text-sm font-bold mb-2">Nombre de usuario</label>
                <div className="flex items-center bg-white border rounded-xl px-4 mb-5">
                  <AtSign size={17} className="text-blue-600" />
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={20}
                    className="w-full bg-transparent p-4 outline-none"
                    placeholder="tu_usuario"
                  />
                </div>

                <label className="block text-sm font-bold mb-2">Nombre completo</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border p-4 rounded-xl mb-5 outline-none"
                />

                <label className="block text-sm font-bold mb-2">Biografía</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-white border p-4 rounded-xl min-h-28 outline-none"
                  placeholder="Cuéntale algo a tu comunidad..."
                />

                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl font-bold mt-5 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </>
          )}

          {page === "Mensajes" && (
            <>
              <div className="mb-7">
                <p className="text-blue-600 text-sm font-bold mb-1">CONECTA</p>
                <h1 className="text-3xl sm:text-4xl font-black">Mensajes</h1>
              </div>

              {!selectedContact ? (
                <div className="glass-panel p-8 text-center">
                  <MessageSquare size={30} className="text-blue-600 mx-auto mb-4" />
                  <p className="font-bold text-lg">Tus conversaciones</p>
                  <p className="text-slate-500 text-sm mt-2">
                    Busca personas en Descubrir para iniciar una conversación.
                  </p>
                  <button
                    onClick={() => navigate("Descubrir")}
                    className="bg-blue-600 text-white px-5 py-3 rounded-xl mt-5 font-bold"
                  >
                    Descubrir personas
                  </button>
                </div>
              ) : (
                <div className="glass-panel overflow-hidden">
                  <div className="p-4 border-b flex items-center gap-3">
                    <button
                      onClick={() => setSelectedContact(null)}
                      className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"
                    >
                      <X size={18} />
                    </button>
                    <Avatar profile={selectedContact} size="sm" />
                    <div className="min-w-0">
                      <p className="font-bold truncate">{selectedContact.full_name}</p>
                      <p className="text-xs text-blue-600">@{selectedContact.username}</p>
                    </div>
                  </div>

                  <div className="p-4 h-[55vh] min-h-64 overflow-y-auto space-y-3">
                    {messages.length === 0 && (
                      <p className="text-center text-sm text-slate-400 py-10">
                        Esta conversación está vacía. ¡Saluda!
                      </p>
                    )}

                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.sender_id === user.id ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[82%] p-3 rounded-2xl ${
                            message.sender_id === user.id
                              ? "bg-blue-600 text-white rounded-br-sm"
                              : "bg-white text-slate-800 rounded-bl-sm border"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          <p className="text-[10px] opacity-70 mt-1">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-3 border-t flex gap-2">
                    <input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendMessage();
                      }}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 min-w-0 bg-white border p-3 rounded-xl outline-none"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!messageText.trim()}
                      className="bg-blue-600 text-white px-5 rounded-xl font-bold disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {page === "Notificaciones" && (
            <>
              <div className="mb-7">
                <p className="text-blue-600 text-sm font-bold mb-1">ACTIVIDAD</p>
                <h1 className="text-3xl sm:text-4xl font-black">Notificaciones</h1>
              </div>
              <div className="glass-panel p-9 text-center">
                <Bell size={28} className="text-blue-600 mx-auto mb-4" />
                <p className="font-bold">Todo tranquilo por ahora</p>
                <p className="text-slate-500 text-sm mt-2">
                  Aquí aparecerán tus novedades cuando configuremos el sistema de notificaciones.
                </p>
              </div>
            </>
          )}

          {page === "Configuración" && (
            <>
              <div className="mb-7">
                <p className="text-blue-600 text-sm font-bold mb-1">PREFERENCIAS</p>
                <h1 className="text-3xl sm:text-4xl font-black">Configuración</h1>
              </div>
              <div className="glass-panel p-6">
                <p className="font-bold">Cuenta de Nexora</p>
                <p className="text-sm text-slate-500 mt-2">{user.email}</p>
                <button
                  onClick={logout}
                  className="mt-5 flex items-center gap-2 text-red-600 font-bold"
                >
                  <LogOut size={18} /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/85 backdrop-blur-2xl border-t px-2 pt-2 pb-[max(env(safe-area-inset-bottom),8px)]">
        <div className="max-w-lg mx-auto flex justify-around">
          {menu.map((item) => {
            const Icon = item.icon;
            const active = page === item.label;

            return (
              <button
                key={item.label}
                onClick={() => navigate(item.label)}
                className={`flex flex-col items-center gap-1 min-w-0 flex-1 py-1 text-xs ${
                  active ? "text-blue-600 font-bold" : "text-slate-400"
                }`}
              >
                <span className={`w-10 h-8 rounded-xl flex items-center justify-center ${active ? "bg-blue-50" : ""}`}>
                  <Icon size={21} strokeWidth={active ? 2.5 : 1.8} />
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <footer className="w-full py-6 mt-10 text-center">
        <p className="text-xs text-slate-400 font-medium tracking-wide">
          © Hecho por <span className="text-slate-500 font-semibold">Juan David Argel Martinez</span>
        </p>
        <p className="text-[10px] text-slate-300 mt-1">
          Nexora · Todos los derechos reservados
        </p>
      </footer>

      <style jsx global>{`
        .glass-panel {
          background: rgba(255,255,255,.76);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,.95);
          border-radius: 24px;
          box-shadow: 0 10px 35px rgba(15,23,42,.045),
            inset 0 1px 0 rgba(255,255,255,.9);
        }
        input, textarea, button {
          -webkit-tap-highlight-color: transparent;
        }
        button {
          transition: background-color .18s ease, color .18s ease,
            transform .18s ease;
        }
        button:active { transform: scale(.98); }
        body { background: #f5f8fd; }
      `}</style>
    </main>
  );
}