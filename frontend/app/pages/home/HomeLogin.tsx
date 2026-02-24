import { Link, useNavigate } from "react-router";
import { loginWithGoogle } from "~/api/auth/login";
import { GoogleLoginButton } from "~/components/buttons/google-login/GoogleLoginButton";
import { LoginForm } from "~/components/forms/user/login/UserLoginForm";
import { useAuth } from "~/stores/useAuth";
import lines from './assets/3lines.png';
import controller from './assets/controller.png';
import orangeCircle from './assets/orangeCircle.png';

//things to fix later: handle submit click, if success -> navigate to tournament page
//if failure give wrong name or password
//will have to check with the data base if it's correct

export function HomeLogin() {
	const setUser = useAuth((state) => state.setUser);
	const user = useAuth((state) => state.user);
	const navigate = useNavigate();

	return (
		<>
			<div className="flex flex-col justify-center items-center w-full pb-16 pt-8">
				<div className="w-[600px] h-[450px] relative bg-pop border-4 border-black rounded-md shadow-md justify-center items-center pb-16 space-y-4">
					<LoginForm
						onSuccess={(user) => {
							console.log(`Logged in as ${user.email}`);
							setUser(user);
							console.log("user name: ", user);
							navigate("/play");
						}}
					/>
					{/*GOOGLE LOG IN*/}

					<div className="flex flex-grow justify-center items-center mx-8 mt-4 border-t border-black">
						<GoogleLoginButton
							clientId={`${import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""}`}
							onLogin={async (credential: string) => {
								try {
									const user = await loginWithGoogle(credential);
									console.log("onSuccess after loginWithGoogle:", user);
									setUser(user ?? null);
									navigate("/play");
								} catch (error) {
									alert((error as Error).message);
								}
							}}
						/>
					</div>

					{/*HANDLE NEW USER*/}
					<div className="flex flex-grow justify-center items-center mx-8 mt-2 ">
						<Link to="/register" className="border font-title border-black px-6 py-2 rounded-lg text-black mt-4">Register New User</Link>
					</div>
				</div>
			</div>

			{/* ******This should be a reusable component since I saw it in several different routes****** */}
			<div className="flex-1 p-6 flex flex-col items-center justify-center">
				<div className="flex items-center mt-8 justify-center">
					<h1 className="text-black dark:text-darkOrange font-title text-3xl h-full ">Transcendence</h1>
				</div>
				<div className="flex flex-row items-start space-x-30">
					<img src={controller} alt="up-down-arrows" className="w-32 h-auto" />
					<div className="flex flex-col items-center mt-8 justify-center border-2 border-black dark:border-background rounded-lg p-4">
						<h3 className="text-black dark:text-background font-title text-2xl h-full ">Made By</h3>
						<p className="text-black dark:text-background text-center font-body">Alice</p>
						<p className="text-black dark:text-background text-center font-body">Sumin</p>
						<p className="text-black dark:text-background text-center font-body">Hoang</p>
						<p className="text-black dark:text-background text-center font-body">Joseph</p>
						<p className="text-black dark:text-background text-center font-body">Timo</p>
					</div>
					<div className="flex flex-col items-center">
						<img src={orangeCircle} alt="orangeCircle" className="w-32 h-auto" />
						<img src={lines} alt="3 lines" className="w-32 h-auto mt-10" />
					</div>
				</div>
			</div>
		</>
	);
}

export default HomeLogin;


