"use client";

import { useEffect, useState } from "react";
import { ControllerClient, type ControllerOptions, type ControllerStatus } from "./controller-client";
import { LocalPad } from "@/lib/input/local-pad";
import { HostRoom, type HostStatus } from "./host-room";
import type { LinkMode } from "./link";
import type { ControllerLayout, PlayerInfo } from "./protocol";

/** Owns a HostRoom for the lifetime of the component. */
export function useHostRoom(code: string) {
  const [room, setRoom] = useState<HostRoom | null>(null);
  const [status, setStatus] = useState<HostStatus>("starting");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [layout, setLayout] = useState<{ layout: ControllerLayout; caption?: string }>({ layout: { kind: "lobby" } });

  useEffect(() => {
    const r = new HostRoom(code);
    const offs = [r.on("status", setStatus), r.on("players", setPlayers), r.on("layout", setLayout)];
    r.start();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- room is an external system created here
    setRoom(r);
    return () => {
      offs.forEach((off) => off());
      r.destroy();
    };
  }, [code]);

  return { room, status, players, layout: layout.layout };
}

/** Owns a ControllerClient for the lifetime of the component. */
export function useController(code: string, name: string, { screen = false }: ControllerOptions = {}) {
  const [client, setClient] = useState<ControllerClient | null>(null);
  const [status, setStatus] = useState<ControllerStatus>("connecting");
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [layout, setLayout] = useState<{ layout: ControllerLayout; caption?: string }>({
    layout: { kind: "lobby" },
  });
  const [rtt, setRtt] = useState<number | null>(null);
  const [mode, setMode] = useState<LinkMode | null>(null);
  const [lobby, setLobby] = useState<{ players: PlayerInfo[]; gameId: string | null }>({ players: [], gameId: null });
  const [spectating, setSpectating] = useState(false);

  useEffect(() => {
    const c = new ControllerClient(code, name, { screen });
    const offs = [
      c.on("status", setStatus),
      c.on("welcome", ({ player }) => {
        setPlayer(player);
        setSpectating(player === null);
      }),
      c.on("layout", setLayout),
      c.on("rtt", setRtt),
      c.on("mode", setMode),
      c.on("lobby", setLobby),
    ];
    c.start();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client is an external system created here
    setClient(c);
    return () => {
      offs.forEach((off) => off());
      c.destroy();
    };
  }, [code, name, screen]);

  return { client, status, player, layout, rtt, mode, lobby, spectating };
}

/** Seat a player on this computer's keyboard/gamepad for as long as the component lives. */
export function useLocalSeat(room: HostRoom | null) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!room || name === null) return;
    if (!room.joinLocal(name)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the room was full; reflect that
      setName(null);
      return;
    }
    const pad = new LocalPad((s) => room.setLocalInput(s));
    const detach = pad.attach(window);
    return () => {
      detach();
      room.leaveLocal();
    };
  }, [room, name]);

  return { localName: name, joinLocal: setName, leaveLocal: () => setName(null) };
}
