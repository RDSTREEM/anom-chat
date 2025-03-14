'use client';
import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

export default function ChatApp() {
	const [username, setUsername] = useState('');
	const [room, setRoom] = useState('');
	const [inputRoom, setInputRoom] = useState('');
	const [message, setMessage] = useState('');
	const [messages, setMessages] = useState([]);

	useEffect(() => {
		if (!room) return;

		const fetchMessages = async () => {
			let { data } = await supabase
				.from('messages')
				.select('*')
				.eq('room', room)
				.order('created_at', { ascending: true });

			setMessages(data);
		};

		fetchMessages();

		const subscription = supabase
			.channel(`room-${room}`)
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'messages' },
				(payload) => {
					setMessages((prev) => [...prev, payload.new]);
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(subscription);
		};
	}, [room]);

	const sendMessage = async () => {
		if (!message.trim()) return;
		await supabase.from('messages').insert([{ username, message, room }]);
		setMessage('');
	};

	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-6">
			{!room ? (
				<div className="p-6 rounded-lg shadow-lg">
					<h2 className="text-xl font-bold mb-2">Join a Chat Room</h2>
					<input
						type="text"
						placeholder="Username"
						className="border p-2 rounded w-full mb-2"
						onChange={(e) => setUsername(e.target.value)}
					/>
					<input
						type="text"
						placeholder="Room Name"
						className="border p-2 rounded w-full mb-2"
						value={inputRoom}
						onChange={(e) => setInputRoom(e.target.value)}
					/>
					<button
						onClick={() => {
							if (inputRoom.trim()) setRoom(inputRoom);
						}}
						className="bg-blue-500 text-white px-4 py-2 rounded w-full">
						Join Room
					</button>
				</div>
			) : (
				<div className="w-full max-w-lg p-6 rounded-lg shadow-lg">
					<h2 className="text-xl font-bold mb-2">Room: {room}</h2>
					<div className="h-64 overflow-y-auto border p-2 mb-2">
						{messages.map((msg, index) => (
							<p key={index} className="text-sm">
								<strong>{msg.username}:</strong> {msg.message}
							</p>
						))}
					</div>
					<input
						type="text"
						placeholder="Type a message..."
						className="border p-2 rounded w-full"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
					/>
					<button
						onClick={sendMessage}
						className="bg-green-500 text-white px-4 py-2 rounded w-full mt-2">
						Send
					</button>
				</div>
			)}
		</div>
	);
}
