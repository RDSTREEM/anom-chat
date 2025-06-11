'use client';
import {
	useEffect,
	useState,
	useRef,
	useEffect as useLayoutEffect
} from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

export default function ChatRoom({ params }) {
	const router = useRouter();
	const room = params.room;
	const [roomId, setRoomId] = useState(null);
	const [username, setUsername] = useState('');
	const [message, setMessage] = useState('');
	const [messages, setMessages] = useState([]);
	const [users, setUsers] = useState([]);
	const [isSending, setIsSending] = useState(false);
	const [deletingId, setDeletingId] = useState(null);
	const [isTyping, setIsTyping] = useState(false);
	const [othersTyping, setOthersTyping] = useState([]);
	let typingTimeout = null;
	const chatEndRef = useRef(null);

	// Load saved username from localStorage
	useEffect(() => {
		let savedUsername = localStorage.getItem('username');

		if (!savedUsername) {
			savedUsername = `user-${Math.floor(Math.random() * 100000)}`;
			localStorage.setItem('username', savedUsername);
		}

		setUsername(savedUsername);
	}, []);

	// Fetch room details and messages
	useEffect(() => {
		if (!room) return;

		const fetchRoom = async () => {
			let { data: roomData } = await supabase
				.from('rooms')
				.select('*')
				.eq('name', room)
				.single();

			if (!roomData) {
				router.push('/'); // Redirect if room doesn’t exist
				return;
			}

			setRoomId(roomData.id);

			let { data: messagesData } = await supabase
				.from('messages')
				.select('*')
				.eq('room_id', roomData.id)
				.order('created_at', { ascending: true });

			setMessages(messagesData);
		};

		fetchRoom();
	}, [room, router]);

	// Fetch users in the room
	useEffect(() => {
		if (!roomId) return;

		const fetchUsers = async () => {
			let { data: usersData } = await supabase
				.from('messages')
				.select('username')
				.eq('room_id', roomId);
			const uniqueUsers = Array.from(new Set(usersData.map((u) => u.username)));
			setUsers(uniqueUsers);
		};

		fetchUsers();

		// Listen for new messages to update user list
		const subscription = supabase
			.channel(`room-${roomId}-userlist`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'messages',
					filter: `room_id=eq.${roomId}`
				},
				() => fetchUsers()
			)
			.subscribe();

		return () => {
			supabase.removeChannel(subscription);
		};
	}, [roomId]);

	// Listen for new messages in the room
	useEffect(() => {
		if (!roomId) return;

		const subscription = supabase
			.channel(`room-${roomId}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'messages',
					filter: `room_id=eq.${roomId}`
				},
				(payload) => {
					setMessages((prev) => [...prev, payload.new]);
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(subscription);
		};
	}, [roomId]);

	// Listen for typing events
	useEffect(() => {
		if (!roomId) return;

		const channel = supabase.channel(`typing-${roomId}`);
		channel
			.on('broadcast', { event: 'typing' }, (payload) => {
				if (payload.payload.username !== username) {
					setOthersTyping((prev) => {
						if (!prev.includes(payload.payload.username)) {
							return [...prev, payload.payload.username];
						}
						return prev;
					});
					setTimeout(() => {
						setOthersTyping((prev) =>
							prev.filter((u) => u !== payload.payload.username)
						);
					}, 2000);
				}
			})
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [roomId, username]);

	// Auto-scroll to latest message
	useLayoutEffect(() => {
		if (chatEndRef.current) {
			chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [messages]);

	// Send a message
	const sendMessage = async () => {
		if (!message.trim() || !roomId || isSending) return;

		setIsSending(true);
		await supabase
			.from('messages')
			.insert([{ username, message, room_id: roomId }]);
		setMessage('');
		setIsSending(false);
	};

	// Send message when Enter is pressed
	const handleKeyPress = (e) => {
		if (e.key === 'Enter') sendMessage();
	};

	// Broadcast typing event
	const handleTyping = (e) => {
		setMessage(e.target.value);
		if (!isTyping) {
			setIsTyping(true);
			supabase.channel(`typing-${roomId}`).send({
				type: 'broadcast',
				event: 'typing',
				payload: { username }
			});
			if (typingTimeout) clearTimeout(typingTimeout);
			typingTimeout = setTimeout(() => setIsTyping(false), 2000);
		}
	};

	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-blue-50 to-green-100">
			<h2 className="text-2xl font-extrabold mb-4 text-green-700 drop-shadow">
				Room: {room}
			</h2>
			{users.length > 0 && (
				<div className="mb-2 w-full max-w-lg text-xs text-gray-600 flex flex-wrap gap-2">
					<strong>Users:</strong> {users.join(', ')}
				</div>
			)}
			<div className="h-64 overflow-y-auto border rounded-lg shadow bg-white/80 p-2 mb-2 w-full max-w-lg">
				{messages.map((msg, index) => {
					const isMe = msg.username === username;
					return (
						<div
							key={index}
							className={`flex items-center text-sm group mb-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
							{!isMe && (
								<div className="w-7 h-7 rounded-full bg-green-200 flex items-center justify-center mr-2 font-bold text-green-700">
									{msg.username.slice(0, 2).toUpperCase()}
								</div>
							)}
							<p
								className={`flex-1 px-3 py-1 rounded-lg ${isMe ? 'bg-green-100 text-green-900' : 'bg-gray-100 text-gray-800'} shadow-sm max-w-[80%] break-words`}>
								<strong>{msg.username}</strong>: {msg.message}
								<span className="text-xs text-gray-400 ml-2">
									{msg.created_at
										? new Date(msg.created_at).toLocaleTimeString([], {
												hour: '2-digit',
												minute: '2-digit'
											})
										: ''}
								</span>
							</p>
							{isMe && (
								<button
									disabled={deletingId === msg.id}
									onClick={async () => {
										setDeletingId(msg.id);
										await supabase.from('messages').delete().eq('id', msg.id);
										setMessages((prev) => prev.filter((m) => m.id !== msg.id));
										setDeletingId(null);
									}}
									className="ml-2 text-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
									{deletingId === msg.id ? 'Deleting...' : 'Delete'}
								</button>
							)}
						</div>
					);
				})}
				<div ref={chatEndRef} />
			</div>
			<input
				type="text"
				placeholder="Username"
				className="border p-2 rounded w-full mb-2 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-300 transition"
				value={username}
				readOnly
			/>
			<input
				type="text"
				placeholder="Type a message..."
				className="border p-2 rounded w-full bg-white focus:ring-2 focus:ring-green-300 transition"
				value={message}
				onChange={handleTyping}
				onKeyDown={handleKeyPress}
			/>
			{othersTyping.length > 0 && (
				<div className="text-xs text-gray-500 mb-2 w-full max-w-lg">
					{othersTyping.join(', ')} {othersTyping.length === 1 ? 'is' : 'are'}{' '}
					typing...
				</div>
			)}
			<button
				onClick={sendMessage}
				disabled={isSending}
				className="bg-gradient-to-r from-green-400 to-green-600 text-white px-4 py-2 rounded w-full mt-2 font-semibold shadow hover:from-green-500 hover:to-green-700 transition">
				{isSending ? 'Sending...' : 'Send'}
			</button>
		</div>
	);
}
