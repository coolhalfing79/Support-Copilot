from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from api.dependencies import get_db
from schemas.auth import UserRegister, UserLogin, Token, UserResponse
from services.auth_service import AuthService
from models.enums import UserRole

router = APIRouter(tags=["auth"])
auth_service = AuthService()

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    existing_user = await auth_service.get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    user = await auth_service.create_user(
        db, 
        user_data.username, 
        user_data.email, 
        user_data.password, 
        user_data.role or UserRole.agent
    )
    await db.commit()
    return user

@router.post("/login", response_model=Token)
async def login(login_data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await auth_service.get_user_by_email(db, login_data.email)
    if not user or not auth_service.verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = auth_service.create_access_token(
        data={"sub": user.email, "role": user.role.value}
    )
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "role": user.role.value,
        "name": user.username,
        "id": str(user.id)
    }
